import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assembleReport, type DeviceReportInput } from './deviceReport';
import { aggregateTextureEstimate, scanSceneTextures } from './textureEstimate';

const baseInput = (): DeviceReportInput => ({
  checkpoint: 'A',
  environment: {
    appVersion: '0.2.0', mode: 'production',
    viewport: { width: 390, height: 844, dpr: 3 },
    maxTouchPoints: 5,
    documentVisibility: 'visible',
    telegram: { insideTelegram: true, platform: 'ios', version: '12.0', safeAreaInset: { top: 59, bottom: 34 }, contentSafeAreaInset: { top: 103, bottom: 0 } },
    webgl: { vendor: 'Apple', renderer: 'Apple GPU' },
  },
  renderer: { frameloop: 'demand', calls: 12, triangles: 3456, textures: 7, geometries: 9, programs: 4, dpr: 1.5, canvasCssSize: { width: 390, height: 700 } },
  renderingLifecycle: {
    webglContextLostCount: 1,
    webglContextRestoredCount: 1,
    environmentPresent: true,
    environmentRevision: 2,
    environmentBuildFailureCount: 0,
    contextLost: false,
    rendererTextures: 7,
    rendererPrograms: 4,
  },
  assets: { loadedAssets: 2, totalKnownBytes: 1024, entries: [{ assetId: 'sofa', status: 'ready', byteSize: 512 }, { assetId: 'missing', status: 'error', byteSize: 0 }], loadFailures: [{ assetId: 'missing', status: 'error', byteSize: 0 }] },
  textureMemory: { kind: 'estimate', bytes: 42_000_000, method: 'heuristic', coverage: 'scene-discoverable-textures', textures: 6 },
  textureDetails: [],
  activeWindows: [],
  completedWindows: [],
  lifecycle: [{ at: 1, kind: 'visibilitychange', detail: 'hidden' }],
});

describe('assembleReport', () => {
  it('produces a self-describing immutable report with an injectable timestamp', () => {
    const report = assembleReport(baseInput(), 1234) as DeviceReportInput & { schema: string; capturedAt: number; pacingNote: string };
    expect(report.schema).toBe('interior-magic.device-report/1');
    expect(report.capturedAt).toBe(1234);
    expect(report.pacingNote).toContain('intervals between rendered frames');
    expect(report.pacingNote).not.toContain('FPS metric is');
    expect(report.environment.telegram).toEqual({ insideTelegram: true, platform: 'ios', version: '12.0', safeAreaInset: { top: 59, bottom: 34 }, contentSafeAreaInset: { top: 103, bottom: 0 } });
    // physical-device diagnostics must carry both Telegram inset sources
    expect(report.environment.telegram.safeAreaInset).toBeDefined();
    expect(report.environment.telegram.contentSafeAreaInset).toBeDefined();
    expect(report.renderer?.frameloop).toBe('demand');
    expect(report.renderingLifecycle).toMatchObject({ environmentPresent: true, environmentRevision: 2 });
    expect(report.assets.loadFailures).toHaveLength(1);
  });
});

const texturedScene = () => {
  const material = new THREE.MeshStandardMaterial({
    map: Object.assign(new THREE.Texture(), { name: 'albedo', image: { width: 2048, height: 2048 } }),
    normalMap: Object.assign(new THREE.Texture(), { name: 'normal', image: { width: 1024, height: 1024 } }),
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const root = new THREE.Group();
  root.add(mesh);
  return root;
};

describe('texture estimate', () => {
  it('discovers unique scene textures once and labels bytes as an estimate', () => {
    const scene = texturedScene();
    const scan = scanSceneTextures('sheenChair', scene);
    // two unique textures despite one shared material across the traversal graph
    expect(scan.textures).toHaveLength(2);
    expect(scan.estimatedBytes).toBeGreaterThan(0);
    const aggregate = aggregateTextureEstimate([scan]);
    expect(aggregate.memory.kind).toBe('estimate');
    expect(aggregate.memory.method).toContain('heuristic');
    expect(aggregate.memory.coverage).toContain('excludes PMREM');
    expect(aggregate.memory.textures).toBe(2);
    expect(aggregate.details[0]).toMatchObject({ assetId: 'sheenChair', width: 2048, height: 2048 });
  });

  it('reports unknown dimensions without inventing bytes', () => {
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); // image not decoded yet
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const aggregate = aggregateTextureEstimate([scanSceneTextures('chair', root)]);
    expect(aggregate.memory.bytes).toBe(0);
    expect(aggregate.memory.textures).toBe(1);
    expect(aggregate.details[0]).toMatchObject({ width: null, height: null });
  });
});
