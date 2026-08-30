import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RestoreSafeEnvironment } from './RestoreSafeEnvironment';

export const RENDERING_BASELINE = { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.05, environmentIntensity: 0.72, keyIntensity: 1.15 } as const;

export function EnvironmentLighting() {
  const gl = useThree((state) => state.gl), scene = useThree((state) => state.scene), invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const lifecycle = new RestoreSafeEnvironment({
      renderer: gl,
      scene,
      environmentIntensity: RENDERING_BASELINE.environmentIntensity,
      invalidate,
      buildEnvironment: () => {
        const generator = new THREE.PMREMGenerator(gl), room = new RoomEnvironment();
        try {
          return generator.fromScene(room, 0.04);
        } finally {
          room.dispose();
          generator.dispose();
        }
      },
      onBuildError: (error) => console.error('Failed to rebuild the scene environment after WebGL restoration', error),
    });
    lifecycle.mount();
    return () => lifecycle.dispose();
  }, [gl, invalidate, scene]);
  return <directionalLight color="#fff2dd" position={[3.5, 6, 4.5]} intensity={RENDERING_BASELINE.keyIntensity} />;
}
