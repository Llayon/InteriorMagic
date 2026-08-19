import { useCallback, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import { Room } from './room/Room';
import { FurnitureObject } from './furniture/FurnitureObject';
import { useEditorStore } from '@/editor/state/store';
import { qualityProfile, QUALITY } from '@/shared/quality';
import { CameraGateContext } from '@/scene/interactions/CameraGate';
import { DebugStatsBridge } from '@/scene/debug/DebugStats';
import { isDebugEnabled } from '@/shared/debug';
import { isTestMode, registerTestScene } from '@/test/diagnostics';

function TestSceneBridge() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => { registerTestScene({ camera, gl }); return () => registerTestScene(null); }, [camera, gl]);
  return null;
}

function Content() {
  const objects = useEditorStore((state) => state.project.objects);
  const dragging = useEditorStore((state) => state.session.mode === 'dragging');
  const controls = useRef<CameraControlsImpl>(null);
  const setCameraEnabled = useCallback((enabled: boolean) => { if (controls.current) controls.current.enabled = enabled; }, []);
  return <CameraGateContext.Provider value={setCameraEnabled}>
    <color attach="background" args={['#eee9df']} />
    <hemisphereLight args={['#fff8e8', '#756b61', 1.35]} />
    <directionalLight color="#fff1d6" position={[3, 6, 4]} intensity={1.85} />
    <Room />
    {objects.map((object) => <FurnitureObject key={object.instanceId} object={object} />)}
    <CameraControls ref={controls} enabled={!dragging} makeDefault minDistance={4.8} maxDistance={8.5} minPolarAngle={.65} maxPolarAngle={1.32} minAzimuthAngle={-.95} maxAzimuthAngle={1.05} truckSpeed={0} dollySpeed={.4} />
    {isDebugEnabled && <DebugStatsBridge />}
    {isTestMode && <TestSceneBridge />}
  </CameraGateContext.Provider>;
}

export function SceneCanvas() {
  return <Canvas onPointerMissed={() => useEditorStore.getState().select(null)} frameloop="demand" dpr={QUALITY[qualityProfile].dpr} camera={{ position: [5, 4.6, 6.5], fov: 44, near: .1, far: 40 }} gl={{ antialias: qualityProfile !== 'low', powerPreference: 'high-performance' }}><Content /></Canvas>;
}
