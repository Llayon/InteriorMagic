import type * as THREE from 'three';
import { RenderingLifecycleDiagnostics, renderingLifecycleDiagnostics } from './renderingLifecycleDiagnostics';

export interface OwnedEnvironmentTarget {
  texture: THREE.Texture;
  dispose(): void;
}

interface RestoreSafeEnvironmentOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  environmentIntensity: number;
  invalidate: () => void;
  buildEnvironment: () => OwnedEnvironmentTarget;
  diagnostics?: RenderingLifecycleDiagnostics;
  onBuildError?: (error: unknown) => void;
}

/** Owns a generated environment target and replaces it after WebGL restore. */
export class RestoreSafeEnvironment {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly environmentIntensity: number;
  private readonly invalidate: () => void;
  private readonly buildEnvironment: () => OwnedEnvironmentTarget;
  private readonly diagnostics: RenderingLifecycleDiagnostics;
  private readonly onBuildError?: (error: unknown) => void;
  private previousEnvironment: THREE.Texture | null = null;
  private previousIntensity = 1;
  private ownedTarget: OwnedEnvironmentTarget | null = null;
  private mounted = false;

  constructor(options: RestoreSafeEnvironmentOptions) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.environmentIntensity = options.environmentIntensity;
    this.invalidate = options.invalidate;
    this.buildEnvironment = options.buildEnvironment;
    this.diagnostics = options.diagnostics ?? renderingLifecycleDiagnostics;
    this.onBuildError = options.onBuildError;
  }

  private rebuildEnvironment = () => {
    const replacement = this.buildEnvironment();
    const replaced = this.ownedTarget;
    this.ownedTarget = replacement;
    this.scene.environment = replacement.texture;
    this.scene.environmentIntensity = this.environmentIntensity;
    this.diagnostics.recordEnvironmentRebuilt();
    replaced?.dispose();
    this.invalidate();
  };

  private readonly onContextLost = (event: Event) => {
    // A canceled webglcontextlost event permits the browser to restore the
    // existing renderer instead of making the loss permanent.
    event.preventDefault();
    this.diagnostics.recordContextLost();
  };

  private readonly onContextRestored = () => {
    this.diagnostics.recordContextRestored();
    try {
      this.rebuildEnvironment();
    } catch (error) {
      this.diagnostics.recordEnvironmentBuildFailure();
      this.onBuildError?.(error);
      this.invalidate();
    }
  };

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    this.previousEnvironment = this.scene.environment;
    this.previousIntensity = this.scene.environmentIntensity;
    this.diagnostics.register(this.renderer, this.scene);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    try {
      this.rebuildEnvironment();
    } catch (error) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.diagnostics.recordEnvironmentBuildFailure();
      this.diagnostics.unregister(this.renderer, this.scene);
      this.mounted = false;
      throw error;
    }
  }

  dispose() {
    if (!this.mounted) return;
    this.mounted = false;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scene.environment = this.previousEnvironment;
    this.scene.environmentIntensity = this.previousIntensity;
    const owned = this.ownedTarget;
    this.ownedTarget = null;
    owned?.dispose();
    this.diagnostics.unregister(this.renderer, this.scene);
    this.invalidate();
  }
}
