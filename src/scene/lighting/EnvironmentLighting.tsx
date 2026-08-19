import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const RENDERING_BASELINE = { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.05, environmentIntensity: 0.72, keyIntensity: 1.15 } as const;

export function EnvironmentLighting() {
  const gl = useThree((state) => state.gl), scene = useThree((state) => state.scene), invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl), room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04).texture;
    room.dispose(); generator.dispose();
    const previous = scene.environment, previousIntensity = scene.environmentIntensity;
    scene.environment = environment; scene.environmentIntensity = RENDERING_BASELINE.environmentIntensity; invalidate();
    return () => { scene.environment = previous; scene.environmentIntensity = previousIntensity; environment.dispose(); invalidate(); };
  }, [gl, invalidate, scene]);
  return <directionalLight color="#fff2dd" position={[3.5, 6, 4.5]} intensity={RENDERING_BASELINE.keyIntensity} />;
}
