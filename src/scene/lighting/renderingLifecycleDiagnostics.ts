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
}

export class RenderingLifecycleDiagnostics {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private lostCount = 0;
  private restoredCount = 0;
  private environmentRevision = 0;
  private buildFailureCount = 0;
  private contextIsLost = false;

  register(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
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
    };
  }
}

export const renderingLifecycleDiagnostics = new RenderingLifecycleDiagnostics();
