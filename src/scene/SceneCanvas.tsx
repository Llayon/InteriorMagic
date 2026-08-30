import { useCallback, useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
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
import { isDeviceQaEnabled } from '@/shared/deviceQa';
import { DeviceQaSceneBridge } from '@/deviceqa/DeviceQaSceneBridge';
import { fitRoom } from '@/scene/camera/fitRoom';
import type { WorkspaceGeometry } from '@/app/useWorkspaceGeometry';
import { EnvironmentLighting, RENDERING_BASELINE } from '@/scene/lighting/EnvironmentLighting';

function TestSceneBridge({ controls, workspace }: { controls: RefObject<CameraControlsImpl | null>; workspace: WorkspaceGeometry }) {
  const camera = useThree((state) => state.camera), gl = useThree((state) => state.gl);
  useEffect(() => { registerTestScene({ camera, gl, getControls: () => controls.current, getWorkspace: () => workspace }); return () => registerTestScene(null); }, [camera, controls, gl, workspace]);
  return null;
}

function Content({ workspace }: { workspace: WorkspaceGeometry }) {
  const objects = useEditorStore((state) => state.project.objects), dragging = useEditorStore((state) => state.session.mode === 'dragging');
  const room = useEditorStore((state) => state.project.room), fitRevision = useEditorStore((state) => state.session.fitRoomRevision);
  const controls = useRef<CameraControlsImpl>(null), initialFit = useRef(false), previousFitRevision = useRef(fitRevision);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (!controls.current || !(camera instanceof THREE.PerspectiveCamera) || workspace.width <= 1 || workspace.height <= 1) return;
    const homeRequested = fitRevision !== previousFitRevision.current;
    previousFitRevision.current = fitRevision;
    void fitRoom(camera, controls.current, room, workspace, workspace.insets, initialFit.current, initialFit.current && !homeRequested);
    initialFit.current = true;
  }, [camera, fitRevision, room, workspace]);
  const setCameraEnabled = useCallback((enabled: boolean) => { if (controls.current) controls.current.enabled = enabled; }, []);
  return <CameraGateContext.Provider value={setCameraEnabled}><color attach="background" args={['#e9e4da']} /><EnvironmentLighting /><Room />{objects.map((object) => <FurnitureObject key={object.instanceId} object={object} />)}<CameraControls ref={controls} enabled={!dragging} makeDefault minDistance={4.8} maxDistance={18} minPolarAngle={.65} maxPolarAngle={1.32} minAzimuthAngle={-.95} maxAzimuthAngle={1.05} truckSpeed={0} dollySpeed={.4} />{isDebugEnabled && <DebugStatsBridge />}{isTestMode && <TestSceneBridge controls={controls} workspace={workspace} />}{isDeviceQaEnabled && <DeviceQaSceneBridge />}</CameraGateContext.Provider>;
}

export function SceneCanvas({ workspace }: { workspace: WorkspaceGeometry }) {
  return <Canvas fallback={<div className="scene-load-error" data-testid="scene-webgl-unavailable" role="alert">3D-сцена недоступна в этом браузере. Включите аппаратное ускорение или откройте приложение в Safari/Chrome.</div>} onCreated={({ gl }) => { gl.toneMapping = RENDERING_BASELINE.toneMapping; gl.toneMappingExposure = RENDERING_BASELINE.exposure; gl.outputColorSpace = THREE.SRGBColorSpace; }} onPointerMissed={() => useEditorStore.getState().select(null)} frameloop="demand" dpr={QUALITY[qualityProfile].dpr} camera={{ position: [5, 4.6, 6.5], fov: 44, near: .1, far: 40 }} gl={{ antialias: qualityProfile !== 'low', powerPreference: 'default' }}><Content workspace={workspace} /></Canvas>;
}
