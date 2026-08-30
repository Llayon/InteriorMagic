import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RestoreSafeEnvironment, type OwnedEnvironmentTarget } from './RestoreSafeEnvironment';
import { RenderingLifecycleDiagnostics } from './renderingLifecycleDiagnostics';

const target = (): OwnedEnvironmentTarget & { dispose: ReturnType<typeof vi.fn> } => ({
  texture: new THREE.Texture(),
  dispose: vi.fn(),
});

describe('RestoreSafeEnvironment', () => {
  it('rebuilds after every restore and disposes each replaced PMREM target once', () => {
    const canvas = new EventTarget();
    const renderer = {
      domElement: canvas,
      info: { memory: { textures: 9 }, programs: [{}, {}, {}] },
    } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const previous = new THREE.Texture();
    scene.environment = previous;
    scene.environmentIntensity = 0.5;
    const generated = [target(), target(), target()];
    const buildQueue = [...generated];
    const buildEnvironment = vi.fn(() => buildQueue.shift()!);
    const invalidate = vi.fn();
    const diagnostics = new RenderingLifecycleDiagnostics();
    const lifecycle = new RestoreSafeEnvironment({
      renderer,
      scene,
      environmentIntensity: 0.72,
      invalidate,
      buildEnvironment,
      diagnostics,
    });

    lifecycle.mount();
    const initial = diagnostics.snapshot();
    expect(initial).toMatchObject({
      environmentPresent: true,
      environmentRevision: 1,
      rendererTextures: 9,
      rendererPrograms: 3,
    });

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(buildEnvironment).toHaveBeenCalledTimes(2);
    expect(diagnostics.snapshot()).toMatchObject({
      webglContextLostCount: 1,
      webglContextRestoredCount: 1,
      environmentRevision: 2,
      contextLost: false,
    });

    const secondLost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(secondLost);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(buildEnvironment).toHaveBeenCalledTimes(3);
    expect(diagnostics.snapshot().environmentRevision).toBe(3);

    lifecycle.dispose();
    expect(scene.environment).toBe(previous);
    expect(scene.environmentIntensity).toBe(0.5);
    expect(invalidate).toHaveBeenCalledTimes(4);
    for (const environment of generated) expect(environment.dispose).toHaveBeenCalledTimes(1);

    const afterDispose = diagnostics.snapshot();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(diagnostics.snapshot()).toEqual(afterDispose);
  });
});
