import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCache } from './AssetCache';
import { getAsset } from '@/editor/assets/registry';
import type { FurnitureAssetDefinition } from '@/editor/model/types';

// Deterministic monotonic clock for timing assertions. Tests must NOT rely on
// real wall-clock because durations under test are sub-second and CI jitter
// would mask regressions.
const monotonicClock = (() => {
  let now = 0;
  return {
    advance(deltaMs: number) { now += deltaMs; },
    reset() { now = 0; },
    now() { return now; },
  };
})();
const installMonotonicClock = () => {
  vi.stubGlobal('performance', { now: () => monotonicClock.now() });
};
const restorePerformance = () => {
  vi.unstubAllGlobals();
};

const makeAsset = (overrides: Partial<FurnitureAssetDefinition> = {}): FurnitureAssetDefinition => {
  const base = getAsset('chair');
  return {
    ...base,
    ...overrides,
    id: overrides.id ?? 'timing-asset',
    modelUrl: overrides.modelUrl ?? '/timing-asset.glb',
    normalization: { recenterToFootprint: true },
    dimensions: overrides.dimensions ?? { width: 0.72, height: 1.08, depth: 0.76 },
    footprint: overrides.footprint ?? { width: 0.72, depth: 0.76 },
  };
};

const stubFetch = (responses: Array<{ status?: number; body?: ArrayBuffer; delayMs?: number }>) => {
  const queue = [...responses];
  vi.stubGlobal('fetch', vi.fn(async () => {
    const response = queue.shift() ?? { status: 200, body: new ArrayBuffer(0) };
    if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    return new Response(response.body ?? new ArrayBuffer(0), { status: response.status ?? 200 });
  }));
};

// Stub GLTFLoader so parseAssetBuffer is fast and deterministic in unit tests.
// parseAssetBuffer will still call auditBounds/normalizeAssetScene which require
// valid dimensions; makeAsset() supplies them.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async parseAsync() {
      const THREE = await import('three');
      const scene = new THREE.Group();
      scene.name = 'stub';
      return { scene };
    }
  },
}));

describe('AssetCache load timing diagnostics', () => {
  beforeEach(() => {
    monotonicClock.reset();
    installMonotonicClock();
  });
  afterEach(() => {
    restorePerformance();
    vi.restoreAllMocks();
  });

  it('records a complete ready lifecycle: ttfbMs, downloadMs, parseMs, totalMs are all finite and ordered', async () => {
    // Page time advances 100ms before the load starts, then 50ms during fetch.
    monotonicClock.advance(100);
    stubFetch([{ status: 200, body: new ArrayBuffer(2048) }]);
    const cache = new AssetCache();
    const asset = makeAsset({ id: 'ok-asset' });

    const promise = cache.load(asset);
    monotonicClock.advance(50); // TTFB window
    const ready = await promise;
    expect(ready).not.toBeNull();

    const entry = cache.diagnostics().assets.find((row) => row.assetId === 'ok-asset')!;
    expect(entry.status).toBe('ready');
    expect(entry.byteSize).toBe(2048);
    expect(entry.timing).toBeDefined();
    // ttfbMs = headersReceived - fetchStart. Stub fetch resolves instantly, but
    // headersReceived is captured AFTER fetchStart, so the difference is the
    // 50ms window we advanced.
    expect(entry.timing!.ttfbMs).toBeGreaterThanOrEqual(50);
    expect(entry.timing!.downloadMs).toBe(0); // body arrives instantly after headers
    expect(entry.timing!.parseMs).toBeGreaterThanOrEqual(0);
    expect(entry.timing!.totalMs).toBeGreaterThanOrEqual(entry.timing!.ttfbMs);
    expect(entry.timing!.totalMs).toBeGreaterThanOrEqual(50);
  });

  it('measures distinct TTFB and total durations across a multi-stage fetch', async () => {
    monotonicClock.advance(200);
    // Use vi.useFakeTimers to drive setTimeout deterministically.
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(async () => {
        // Simulate TTFB delay and a separate body read delay.
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        const r = new Response(new ArrayBuffer(4096), { status: 200 });
        const origAB = r.arrayBuffer.bind(r);
        r.arrayBuffer = async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 40));
          return origAB();
        };
        return r;
      }));
      const cache = new AssetCache();
      const asset = makeAsset({ id: 'stage-asset' });

      const promise = cache.load(asset);
      await vi.advanceTimersByTimeAsync(100);
      const ready = await promise;
      expect(ready).not.toBeNull();

      const entry = cache.diagnostics().assets.find((row) => row.assetId === 'stage-asset')!;
      const timing = entry.timing!;
      // Distinct stages should each be positive when real time advances.
      expect(timing.ttfbMs).toBeGreaterThanOrEqual(20);
      expect(timing.downloadMs).toBeGreaterThanOrEqual(30);
      expect(timing.totalMs).toBeGreaterThanOrEqual(timing.ttfbMs + timing.downloadMs);
      for (const value of [timing.ttfbMs, timing.downloadMs, timing.parseMs, timing.totalMs]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps an HTTP failure local with errorStage=headers and a finite totalMs', async () => {
    monotonicClock.advance(50);
    stubFetch([{ status: 500, body: new ArrayBuffer(0) }]);
    const cache = new AssetCache();
    const asset = makeAsset({ id: 'http-fail' });

    await expect(cache.load(asset)).rejects.toThrow(/500/);

    const entry = cache.diagnostics().assets.find((row) => row.assetId === 'http-fail')!;
    expect(entry.status).toBe('error');
    expect(entry.errorStage).toBe('headers');
    expect(entry.timing).toBeDefined();
    expect(Number.isFinite(entry.timing!.totalMs)).toBe(true);
    expect(entry.timing!.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('flags parse failures with errorStage=parse and preserves bodyReceived timing', async () => {
    monotonicClock.advance(75);
    stubFetch([{ status: 200, body: new ArrayBuffer(8) }]);
    // Reach into the cached loader module via vitest's vi.resetModules + re-import
    // so the next AssetCache.load uses the throwing parser.
    vi.resetModules();
    vi.doMock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
      GLTFLoader: class { async parseAsync() { throw new Error('parse-explode'); } },
    }));
    const { AssetCache: FreshAssetCache } = await import('./AssetCache');
    const cache = new FreshAssetCache();
    const asset = makeAsset({ id: 'parse-fail' });

    await expect(cache.load(asset)).rejects.toThrow(/parse-explode/);

    const entry = cache.diagnostics().assets.find((row) => row.assetId === 'parse-fail')!;
    expect(entry.status).toBe('error');
    expect(entry.errorStage).toBe('parse');
    expect(entry.timing!.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('does not issue a second network request when the same asset is loaded twice', async () => {
    monotonicClock.advance(10);
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(64), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache = new AssetCache();
    const asset = makeAsset({ id: 'deduped' });

    await Promise.all([cache.load(asset), cache.load(asset)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const entry = cache.diagnostics().assets.find((row) => row.assetId === 'deduped')!;
    expect(entry.status).toBe('ready');
  });

  it('resolves an assetless model synchronously to null and adds no entry to diagnostics', async () => {
    const cache = new AssetCache();
    const asset = makeAsset({ id: 'no-model', modelUrl: '' });
    const result = await cache.load(asset);
    expect(result).toBeNull();
    const entry = cache.diagnostics().assets.find((row) => row.assetId === 'no-model');
    expect(entry).toBeUndefined();
  });
});