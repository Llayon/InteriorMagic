import type * as THREE from 'three';

export interface LifecycleEvent {
  /** Relative milliseconds since the diagnostics instance was created. */
  relMs: number;
  /** Monotonic ms timestamp (performance.now()-style). */
  monotonicMs: number;
  kind: string;
  detail?: string;
}

export interface RenderingLifecycleSnapshot {
  // ── Run identity (one-per-page-launch) ──
  /** Stable random-ish ID generated at diagnostics construction. */
  runId: string;
  /** Monotonic ms timestamp of the moment the diagnostics instance was created. */
  launchStartedAt: number;
  /** Resolved quality tier for this run ('high' | 'medium' | 'low' in dev; always 'high' in production). */
  qualityTier: 'high' | 'medium' | 'low';
  /** Coarse browser classification, diagnostics-only (never alters runtime). */
  browserClassification: 'safari-ios' | 'chrome-ios' | 'other';

  // ── Camera interaction ──
  /** Count of actual room-camera interactions (Drei CameraControls 'start' events). */
  cameraInteractionCount: number;
  /** Monotonic ms timestamp of the first camera interaction, or null. */
  firstCameraInteractionAt: number | null;

  // ── WebGL context lifecycle ──
  webglContextLostCount: number;
  webglContextRestoredCount: number;
  /** Per-event records with relative timestamps. */
  contextEvents: LifecycleEvent[];

  // ── Asset lifecycle aggregates ──
  /** Monotonic ms timestamp of the first asset that began loading, or null. */
  firstAssetLoadStartedAt: number | null;
  /** Monotonic ms timestamp of the last asset that became ready, or null. */
  lastAssetReadyAt: number | null;
  /** Monotonic ms timestamp of the last instance install (post-commit), or null. */
  lastInstanceInstalledAt: number | null;

  // ── Environment + context state ──
  environmentPresent: boolean;
  environmentRevision: number;
  environmentBuildFailureCount: number;
  contextLost: boolean;

  // ── Renderer state ──
  rendererTextures: number | null;
  rendererPrograms: number | null;
  rendererGeometries: number | null;

  // ── Invalidate counter ──
  invalidateCount: number;
  lastInvalidateAt: number | null;
  framesSinceLastInvalidate: number | null;
  frameloopMode: 'demand' | 'always' | 'never' | null;

  // ── Per-asset lifecycle ──
  assetLifecycle: Record<string, AssetLifecycleEntry>;
}

export interface AssetLifecycleEntry {
  assetId: string;
  loadStartedAt: number | null;
  loadResolvedAt: number | null;
  loadOutcome: 'ready' | 'error' | null;
  instanceInstalledAt: number | null;
}

const nowMonotonic = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const classifyBrowser = (): RenderingLifecycleSnapshot['browserClassification'] => {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  // iOS detection (iPhone/iPad/iPod) — both Safari and Chrome on iOS use WebKit.
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Mac/.test(ua) && typeof (globalThis as { TouchEvent?: unknown }).TouchEvent !== 'undefined');
  if (!isIOS) return 'other';
  if (/CriOS|Chrome/.test(ua)) return 'chrome-ios';
  // Default for iOS without explicit Chrome marker is Safari (WebKit, not Blink).
  return 'safari-ios';
};

const newRunId = (): string => {
  // Sufficient for distinguishing consecutive physical runs in the device-QA
  // report. Not a security identifier; not a UUID. 16 hex chars from a
  // monotonically-seeded counter + clock is more than enough.
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) | 0;
  const rnd = (Math.random() * 0xffffffff) | 0;
  return `${ms.toString(16).padStart(8, '0')}${rnd.toString(16).padStart(8, '0')}`;
};

export class RenderingLifecycleDiagnostics {
  private readonly runIdValue = newRunId();
  private readonly launchStartedAtValue = nowMonotonic();

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private qualityTier: 'high' | 'medium' | 'low' = 'high';
  private browserClass: RenderingLifecycleSnapshot['browserClassification'] = classifyBrowser();

  private lostCount = 0;
  private restoredCount = 0;
  private contextEvents: LifecycleEvent[] = [];

  private cameraInteractionCount = 0;
  private firstCameraInteractionAt: number | null = null;

  private firstAssetLoadStartedAt: number | null = null;
  private lastAssetReadyAt: number | null = null;
  private lastInstanceInstalledAt: number | null = null;

  private environmentRevision = 0;
  private buildFailureCount = 0;
  private contextIsLost = false;

  private invalidateCount = 0;
  private lastInvalidateAt: number | null = null;
  private framesSinceLastInvalidate: number | null = null;
  private frameloopMode: RenderingLifecycleSnapshot['frameloopMode'] = null;

  private assetLifecycle: Record<string, AssetLifecycleEntry> = {};

  setQualityTier(tier: 'high' | 'medium' | 'low') {
    this.qualityTier = tier;
  }

  register(renderer: THREE.WebGLRenderer, scene: THREE.Scene, frameloop?: 'demand' | 'always' | 'never') {
    this.renderer = renderer;
    this.scene = scene;
    if (frameloop) this.frameloopMode = frameloop;
  }

  unregister(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    if (this.renderer === renderer) this.renderer = null;
    if (this.scene === scene) this.scene = null;
  }

  private recordContextEvent(kind: string, detail?: string) {
    const monotonicMs = nowMonotonic();
    this.contextEvents.push({ relMs: monotonicMs - this.launchStartedAtValue, monotonicMs, kind, detail });
  }

  recordContextLost(detail?: string) {
    this.lostCount += 1;
    this.contextIsLost = true;
    this.recordContextEvent('webglcontextlost', detail);
  }

  recordContextRestored(detail?: string) {
    this.restoredCount += 1;
    this.contextIsLost = false;
    this.recordContextEvent('webglcontextrestored', detail);
  }

  recordEnvironmentRebuilt() {
    this.environmentRevision += 1;
  }

  recordEnvironmentBuildFailure() {
    this.buildFailureCount += 1;
  }

  recordInvalidate(now: number = nowMonotonic()) {
    this.invalidateCount += 1;
    this.lastInvalidateAt = now;
    this.framesSinceLastInvalidate = 0;
  }

  recordFrameRendered() {
    if (this.framesSinceLastInvalidate !== null) this.framesSinceLastInvalidate += 1;
  }

  recordCameraInteraction() {
    this.cameraInteractionCount += 1;
    if (this.firstCameraInteractionAt === null) this.firstCameraInteractionAt = nowMonotonic();
  }

  recordAssetLoadStarted(assetId: string, now: number = nowMonotonic()) {
    const entry = this.assetLifecycle[assetId] ?? { assetId, loadStartedAt: null, loadResolvedAt: null, loadOutcome: null, instanceInstalledAt: null };
    entry.loadStartedAt = now;
    entry.loadResolvedAt = null;
    entry.loadOutcome = null;
    entry.instanceInstalledAt = null;
    this.assetLifecycle[assetId] = entry;
    if (this.firstAssetLoadStartedAt === null) this.firstAssetLoadStartedAt = now;
  }

  recordAssetLoadResolved(assetId: string, outcome: 'ready' | 'error', now: number = nowMonotonic()) {
    const entry = this.assetLifecycle[assetId] ?? { assetId, loadStartedAt: null, loadResolvedAt: null, loadOutcome: null, instanceInstalledAt: null };
    entry.loadResolvedAt = now;
    entry.loadOutcome = outcome;
    this.assetLifecycle[assetId] = entry;
    if (outcome === 'ready') this.lastAssetReadyAt = now;
  }

  recordAssetInstanceInstalled(assetId: string, now: number = nowMonotonic()) {
    const entry = this.assetLifecycle[assetId] ?? { assetId, loadStartedAt: null, loadResolvedAt: null, loadOutcome: null, instanceInstalledAt: null };
    entry.instanceInstalledAt = now;
    this.assetLifecycle[assetId] = entry;
    this.lastInstanceInstalledAt = now;
  }

  snapshot(): RenderingLifecycleSnapshot {
    const programs = this.renderer?.info.programs;
    return {
      runId: this.runIdValue,
      launchStartedAt: this.launchStartedAtValue,
      qualityTier: this.qualityTier,
      browserClassification: this.browserClass,
      cameraInteractionCount: this.cameraInteractionCount,
      firstCameraInteractionAt: this.firstCameraInteractionAt,
      webglContextLostCount: this.lostCount,
      webglContextRestoredCount: this.restoredCount,
      contextEvents: [...this.contextEvents],
      firstAssetLoadStartedAt: this.firstAssetLoadStartedAt,
      lastAssetReadyAt: this.lastAssetReadyAt,
      lastInstanceInstalledAt: this.lastInstanceInstalledAt,
      environmentPresent: Boolean(this.scene?.environment),
      environmentRevision: this.environmentRevision,
      environmentBuildFailureCount: this.buildFailureCount,
      contextLost: this.contextIsLost,
      rendererTextures: this.renderer?.info.memory.textures ?? null,
      rendererPrograms: Array.isArray(programs) ? programs.length : null,
      rendererGeometries: this.renderer?.info.memory.geometries ?? null,
      invalidateCount: this.invalidateCount,
      lastInvalidateAt: this.lastInvalidateAt,
      framesSinceLastInvalidate: this.framesSinceLastInvalidate,
      frameloopMode: this.frameloopMode,
      assetLifecycle: { ...this.assetLifecycle },
    };
  }
}

export const renderingLifecycleDiagnostics = new RenderingLifecycleDiagnostics();
