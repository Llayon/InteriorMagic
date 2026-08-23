import { useEffect, useRef } from 'react';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getAsset } from '@/editor/assets/registry';
import { DragController } from '@/editor/interactions/DragController';
import type { FurnitureInstance } from '@/editor/model/types';
import { useEditorStore } from '@/editor/state/store';
import { AssetModel } from '@/scene/assets/AssetModel';
import { useCameraGate } from '@/scene/interactions/CameraGate';
import { ProceduralFurniture } from './ProceduralFurniture';
import { beginTestInteraction, endTestInteraction, isTestMode, registerTestObject } from '@/test/diagnostics';
import { FurnitureGrounding } from './FurnitureGrounding';
import { selectPreviewOverride, usePlannerStore } from '@/editor/planning/ui';

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function FurnitureObject({ object }: { object: FurnitureInstance }) {
  const group = useRef<THREE.Group>(null);
  const proxy = useRef<THREE.Mesh>(null);
  const feedbackMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const controller = useRef(new DragController());
  const clearNativeCancelListeners = useRef<() => void>(() => undefined);
  const invalidate = useThree((state) => state.invalidate);
  const canvas = useThree((state) => state.gl.domElement);
  const gateCamera = useCameraGate();
  const selected = useEditorStore((state) => state.session.selectedId === object.instanceId);
  const asset = getAsset(object.assetId);
  const padding = asset.interaction?.paddingXZ ?? 0.08;
  const proxyHeight = Math.max(asset.dimensions.height, asset.interaction?.minHeight ?? 0.45);
  const proxySize: [number, number, number] = [asset.dimensions.width + padding * 2, proxyHeight, asset.dimensions.depth + padding * 2];

  // Read planner preview override at render time only. The selector returns
  // null whenever preview mode is inactive, in which case the persisted
  // RoomProject transforms are used unchanged. This must NEVER call move(),
  // never mutate the editor store, and never push to undo/redo. The override
  // applies through `<group>` props below; cancelling preview simply flips
  // isPreviewing=false and React reconciles the position back to the persisted
  // values with zero side effects.
  const previewOverride = usePlannerStore((state) => selectPreviewOverride(state, object.instanceId));
  const previewActive = usePlannerStore((state) => state.isPreviewing);
  const previewY = object.position.y;
  const renderPosition: [number, number, number] = previewOverride
    ? [previewOverride.position.x, previewY, previewOverride.position.z]
    : [object.position.x, object.position.y, object.position.z];
  const renderRotationY = previewOverride ? previewOverride.rotationY : object.rotationY;
  useEffect(() => {
    if (!isTestMode || !group.current || !proxy.current) return;
    registerTestObject(object.instanceId, { group: group.current, proxy: proxy.current });
    return () => registerTestObject(object.instanceId, null);
  }, [object.instanceId]);

  const setFeedback = (invalid: boolean) => { if (feedbackMaterial.current) feedbackMaterial.current.visible = invalid; };
  const intersectFloor = (event: ThreeEvent<PointerEvent>) => {
    const hit = new THREE.Vector3();
    return event.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null;
  };
  const finish = (pointerId: number, cancelled: boolean) => {
    if (!controller.current.snapshot || !group.current) return;
    const position = cancelled ? controller.current.cancel(pointerId) : controller.current.finish(pointerId);
    if (!position) return;
    clearNativeCancelListeners.current();
    group.current.position.set(position.x, position.y, position.z);
    setFeedback(false);
    gateCamera(true);
    useEditorStore.getState().setMode('idle');
    if (!cancelled) useEditorStore.getState().move(object.instanceId, position);
    endTestInteraction(cancelled ? 'cancel' : 'commit');
    invalidate();
  };
  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (useEditorStore.getState().session.mode === 'dragging') return;
    // Block drag while planner preview is active. Preview is a read-only visual
    // overlay; user editing must not interfere with it and must not produce
    // store mutations that the preview would then need to be reconciled with.
    if (usePlannerStore.getState().isPreviewing) return;
    const floorHit = intersectFloor(event);
    if (!floorHit) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    const cancel = (nativeEvent: PointerEvent) => { if (nativeEvent.pointerId === event.pointerId) finish(event.pointerId, true); };
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    clearNativeCancelListeners.current = () => {
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
      clearNativeCancelListeners.current = () => undefined;
    };
    controller.current.begin(event.pointerId, object, floorHit);
    beginTestInteraction(event.pointerType, event.pointerId);
    useEditorStore.getState().select(object.instanceId);
    gateCamera(false);
    useEditorStore.getState().setMode('dragging');
  };
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const floorHit = intersectFloor(event);
    if (!floorHit || !group.current) return;
    const preview = controller.current.update(event.pointerId, floorHit, useEditorStore.getState().project);
    if (!preview) return;
    event.stopPropagation();
    group.current.position.set(preview.position.x, preview.position.y, preview.position.z);
    setFeedback(!preview.valid);
    invalidate();
  };
  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!controller.current.snapshot) return;
    event.stopPropagation();
    finish(event.pointerId, false);
    try { (event.target as Element).releasePointerCapture(event.pointerId); } catch { /* Capture may already be lost. */ }
  };
  const onPointerCancel = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); finish(event.pointerId, true); };
  const onLostPointerCapture = (event: ThreeEvent<PointerEvent>) => finish(event.pointerId, true);

  const fallback = <ProceduralFurniture assetId={object.assetId} variantId={object.variantId} />;
  return <group ref={group} position={renderPosition} rotation-y={renderRotationY}>
    {asset.semantic?.role !== 'rug' && <FurnitureGrounding width={asset.footprint.width} depth={asset.footprint.depth} />}
    {asset.modelUrl ? <AssetModel assetId={object.assetId} variantId={object.variantId} fallback={fallback} /> : fallback}
    <mesh
      ref={proxy}
      position={[0, proxyHeight / 2, 0]}
      userData={{ instanceId: object.instanceId, interactionProxy: true }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
    >
      <boxGeometry args={proxySize} />
      <meshBasicMaterial visible={false} transparent opacity={0.18} color="#b83232" depthWrite={false} />
    </mesh>
    <mesh position={[0, .011, 0]} rotation-x={-Math.PI / 2} raycast={() => undefined}>
      <planeGeometry args={[asset.footprint.width, asset.footprint.depth]} />
      <meshBasicMaterial ref={feedbackMaterial} visible={false} transparent opacity={0.28} color="#d53636" depthWrite={false} />
    </mesh>
    {selected && !previewActive && <mesh position={[0, .018, 0]} rotation-x={-Math.PI / 2} raycast={() => undefined}>
      <ringGeometry args={[Math.max(asset.footprint.width, asset.footprint.depth) * .56, Math.max(asset.footprint.width, asset.footprint.depth) * .61, 32]} />
      <meshBasicMaterial color="#f2a65a" toneMapped={false} />
    </mesh>}
    {previewActive && previewOverride && (
      <mesh position={[0, .02, 0]} rotation-x={-Math.PI / 2} raycast={() => undefined}>
        <ringGeometry args={[Math.max(asset.footprint.width, asset.footprint.depth) * .62, Math.max(asset.footprint.width, asset.footprint.depth) * .66, 36]} />
        <meshBasicMaterial color="#c69466" toneMapped={false} transparent opacity={0.55} />
      </mesh>
    )}
  </group>;
}
