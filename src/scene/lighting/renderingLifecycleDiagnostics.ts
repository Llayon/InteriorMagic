import type * as THREE from 'three';

export interface RenderingLifecycleSnapshot {
  webglContextLostCount: number;
  webglContextRestoredCount: number;
  environmentPresent: boolean;
  environmentRevision: number;
  environmentBuildFailureCount: number;
  contextLost: boolean;
  rendererTextures: number | null;
  rendererPrograms: number | null;
  /** Monotonic count of invalidate() calls observed across the scene lifetime. */
  invalidateCount: number;
  /** Last invalidation monotonic ms timestamp (performance.now()-style). */
  lastInvalidateAt: number | null;
  /** Number of frames R3F has rendered since the last invalidate call (sampled). */
  framesSinceLastInvalidate: number | null;
  /** Configured R3F frameloop mode as recorded by the most recent canvas. */
  frameloopMode: 'demand' | 'always' | 'never' | null;
  /** Per-asset load attempts / resolutions / instance install timestamps. */
  assetLifecycle: Record<string, AssetLifecycleEntry>;
}

export interface AssetLifecycleEntry {
  assetId: string;
  loadStartedAt: number | null;
  loadResolvedAt: number | null;
  loadOutcome: 'ready' | 'error' | null;
  instanceInstalledAt: number | null;
}

export class RenderingLifecycleDiagnostics {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private lostCount = 0;
  private restoredCount = 0;
  private environmentRevision = 0;
  private buildFailureCount = 0;
  private contextIsLost = false;
  private invalidateCount = 0;
  private lastInvalidateAt: number | null = null;
  private framesSinceLastInvalidate: number | null = null;
  private frameloopMode: RenderingLifecycleSnapshot['frameloopMode'] = null;
  private assetLifecycle: Record<string, AssetLifecycleEntry> = {};

  register(renderer: THREE.WebGLRenderer, scene: THREE.Scene, frameloop?: 'demand' | 'always' | 'never') {
    this.renderer = renderer;
    this.scene = scene;
    if (frameloop) this.frameloopMode = frameloop;
  }

  unregister(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    if (this.renderer === renderer) this.renderer = null;
    if (this.scene === scene) this.scene = null;
  }

  recordContextLost() {
    this.lostCount += 1;
    this.contextIsLost = true;
  }

  recordContextRestored() {
    this.restoredCount += 1;
    this.contextIsLost = false;
  }

  recordEnvironmentRebuilt() {
    this.environmentRevision += 1;
  }

  recordEnvironmentBuildFailure() {
    this.buildFailureCount += 1;
  }

  recordInvalidate(now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    this.invalidateCount += 1;
    this.lastInvalidateAt = now;
    this.framesSinceLastInvalidate = 0;
  }

  recordFrameRendered() {
    if (this.framesSinceLastInvalidate !== null) this.framesSinceLastInvalidate += 1;
  }

  recordAssetLoadStarted(assetId: string, now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    const entry = this.assetLifecycle[assetId] ?? { assetId, loadStartedAt: null, loadResolvedAt: null, loadOutcome: null, instanceInstalledAt: null };
    entry.loadStartedAt = now;
    entry.loadResolvedAt = null;
    entry.loadOutcome = null;
    entry.instanceInstalledAt = null;
    this.assetLifecycle[assetId] = entry;
  }

  recordAssetLoadResolved(assetId: string, outcome: 'ready' | 'error', now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    const entry = this.assetLifecycle[assetId] ?? { assetId, loadStartedAt: null, loadResolvedAt: null, loadOutcome: null, instanceInstalledAt: null };
    entry.loadResolvedAt = now;
    entry.loadOutcome = outcome;
    this.assetLifecycle[assetId] = entry;
  }

  recordAssetInstanceInstalled(assetId: string, now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    const entry = this.assetLifecycle[assetId] ?? { assetId, loadStartedAt: null, loadResolvedAt: null, loadOutcome: null, instanceInstalledAt: null };
    entry.instanceInstalledAt = now;
    this.assetLifecycle[assetId] = entry;
  }

  snapshot(): RenderingLifecycleSnapshot {
    const programs = this.renderer?.info.programs;
    return {
      webglContextLostCount: this.lostCount,
      webglContextRestoredCount: this.restoredCount,
      environmentPresent: Boolean(this.scene?.environment),
      environmentRevision: this.environmentRevision,
      environmentBuildFailureCount: this.buildFailureCount,
      contextLost: this.contextIsLost,
      rendererTextures: this.renderer?.info.memory.textures ?? null,
      rendererPrograms: Array.isArray(programs) ? programs.length : null,
      invalidateCount: this.invalidateCount,
      lastInvalidateAt: this.lastInvalidateAt,
      framesSinceLastInvalidate: this.framesSinceLastInvalidate,
      frameloopMode: this.frameloopMode,
      assetLifecycle: { ...this.assetLifecycle },
    };
  }
}

export const renderingLifecycleDiagnostics = new RenderingLifecycleDiagnostics();
