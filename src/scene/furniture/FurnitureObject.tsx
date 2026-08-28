import { useEffect, useRef } from 'react';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance } from '@/editor/model/types';
import { useEditorStore } from '@/editor/state/store';
import { ObjectTransformController, type PointerSample } from '@/editor/interactions/ObjectTransformController';
import { AssetModel } from '@/scene/assets/AssetModel';
import { useCameraGate } from '@/scene/interactions/CameraGate';
import { ProceduralFurniture } from './ProceduralFurniture';
import { beginTestInteraction, endTestInteraction, isTestMode, registerTestObject } from '@/test/diagnostics';
import { FurnitureGrounding } from './FurnitureGrounding';
import { selectPreviewOverride, usePlannerStore } from '@/editor/planning/ui';

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function FurnitureObject({ object }: { object: FurnitureInstance }) {
  const group = useRef<THREE.Group>(null), proxy = useRef<THREE.Mesh>(null), feedback = useRef<THREE.MeshBasicMaterial>(null);
  const controller = useRef(new ObjectTransformController());
  const clearCancel = useRef<() => void>(() => undefined);
  const invalidate = useThree((s) => s.invalidate), canvas = useThree((s) => s.gl.domElement), gateCamera = useCameraGate();
  const selected = useEditorStore((s) => s.session.selectedId === object.instanceId), asset = getAsset(object.assetId);
  const plannerPreview = usePlannerStore((s) => selectPreviewOverride(s, object.instanceId)), previewActive = usePlannerStore((s) => s.isPreviewing);
  const pad = asset.interaction?.paddingXZ ?? 0.08, height = Math.max(asset.dimensions.height, asset.interaction?.minHeight ?? 0.45);
  const proxySize: [number, number, number] = [asset.dimensions.width + pad * 2, height, asset.dimensions.depth + pad * 2];
  const position: [number, number, number] = plannerPreview ? [plannerPreview.position.x, object.position.y, plannerPreview.position.z] : [object.position.x, object.position.y, object.position.z];
  const rotation = plannerPreview ? plannerPreview.rotationY : object.rotationY;
  useEffect(() => { if (!isTestMode || !group.current || !proxy.current) return; registerTestObject(object.instanceId, { group: group.current, proxy: proxy.current }); return () => registerTestObject(object.instanceId, null); }, [object.instanceId]);
  const floor = (e: ThreeEvent<PointerEvent>) => { const hit = new THREE.Vector3(); return e.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null; };
  const sample = (e: PointerEvent): PointerSample => ({ pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY });
  const reset = (cancelled: boolean, result?: { position: { x: number; y: number; z: number }; rotationY: number; changed: boolean } | null) => {
    clearCancel.current(); gateCamera(true); useEditorStore.getState().setMode('idle'); if (feedback.current) feedback.current.visible = false;
    if (!cancelled && result?.changed) useEditorStore.getState().commitObjectTransform(object.instanceId, result.position, result.rotationY);
    endTestInteraction(cancelled ? 'cancel' : 'commit'); invalidate();
  };
  // A second touch often starts on the canvas after the first pointer has
  // captured it; bridge that native event into the selected object's controller.
  useEffect(() => {
    const onNativeDown = (e: PointerEvent) => {
      if (useEditorStore.getState().session.selectedId !== object.instanceId || controller.current.activePointerIds.includes(e.pointerId)) return;
      if (controller.current.addPointer(sample(e))) useEditorStore.getState().setMode('rotating');
    };
    const onNativeMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && useEditorStore.getState().session.selectedId === object.instanceId && !controller.current.activePointerIds.includes(e.pointerId) && controller.current.addPointer(sample(e))) useEditorStore.getState().setMode('rotating');
    };
    const onNativeTouchStart = (e: TouchEvent) => {
      const touches = [...e.touches];
      if (touches.length < 2 || useEditorStore.getState().session.selectedId !== object.instanceId) return;
      const second = touches.find((touch) => !controller.current.activePointerIds.includes(touch.identifier));
      if (second && controller.current.addPointer({ pointerId: second.identifier, pointerType: 'touch', clientX: second.clientX, clientY: second.clientY })) useEditorStore.getState().setMode('rotating');
    };
    canvas.addEventListener('pointerdown', onNativeDown, true);
    canvas.addEventListener('pointermove', onNativeMove, true);
    canvas.addEventListener('touchstart', onNativeTouchStart, { passive: true, capture: true });
    return () => { canvas.removeEventListener('pointerdown', onNativeDown, true); canvas.removeEventListener('pointermove', onNativeMove, true); canvas.removeEventListener('touchstart', onNativeTouchStart, true); };
  }, [canvas, object.instanceId]);
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (asset.placement.anchor !== 'floor' || usePlannerStore.getState().isPreviewing) return;
    const s = sample(e.nativeEvent), mode = useEditorStore.getState().session.mode;
    if (mode !== 'idle') { if (controller.current.addPointer(s)) { e.stopPropagation(); canvas.setPointerCapture(s.pointerId); useEditorStore.getState().setMode('rotating'); } return; }
    const hit = floor(e); if (!hit || !controller.current.begin(s, object, hit, useEditorStore.getState().project)) return;
    e.stopPropagation(); canvas.setPointerCapture(s.pointerId);
    const cancel = (native: PointerEvent) => { if (controller.current.activePointerIds.includes(native.pointerId)) { controller.current.cancel(); reset(true); } };
    canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel); clearCancel.current = () => { canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel); clearCancel.current = () => undefined; };
    beginTestInteraction(e.pointerType, e.pointerId); useEditorStore.getState().select(object.instanceId); gateCamera(false); useEditorStore.getState().setMode('dragging');
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => { const preview = controller.current.update(sample(e.nativeEvent), controller.current.mode === 'dragging' ? floor(e) : null); if (!preview || !group.current) return; e.stopPropagation(); group.current.position.set(preview.position.x, preview.position.y, preview.position.z); group.current.rotation.y = preview.rotationY; if (feedback.current) feedback.current.visible = !preview.valid; invalidate(); };
  const onUp = (e: ThreeEvent<PointerEvent>) => { if (!controller.current.activePointerIds.includes(e.pointerId)) return; e.stopPropagation(); const result = controller.current.release(e.pointerId); if (result) reset(false, result); else useEditorStore.getState().setMode('draining'); try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ } };
  const onCancel = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); controller.current.cancel(); reset(true); };
  const fallback = <ProceduralFurniture assetId={object.assetId} variantId={object.variantId} />;
  return <group ref={group} position={position} rotation-y={rotation}>
    {asset.placement.anchor === 'floor' && asset.semantic?.role !== 'rug' && <FurnitureGrounding width={asset.footprint.width} depth={asset.footprint.depth} />}
    {asset.modelUrl ? <AssetModel assetId={object.assetId} variantId={object.variantId} fallback={fallback} /> : fallback}
    <mesh ref={proxy} position={[0, height / 2, 0]} userData={{ instanceId: object.instanceId, interactionProxy: true }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}><boxGeometry args={proxySize} /><meshBasicMaterial visible={false} transparent opacity={0.18} color="#b83232" depthWrite={false} /></mesh>
    <mesh position={[0, .011, 0]} rotation-x={-Math.PI / 2} raycast={() => undefined}><planeGeometry args={[asset.footprint.width, asset.footprint.depth]} /><meshBasicMaterial ref={feedback} visible={false} transparent opacity={0.28} color="#d53636" depthWrite={false} /></mesh>
    {selected && !previewActive && <mesh position={[0, .018, 0]} rotation-x={-Math.PI / 2} raycast={() => undefined}><ringGeometry args={[Math.max(asset.footprint.width, asset.footprint.depth) * .56, Math.max(asset.footprint.width, asset.footprint.depth) * .61, 32]} /><meshBasicMaterial color="#f2a65a" toneMapped={false} /></mesh>}
    {previewActive && plannerPreview && <mesh position={[0, .02, 0]} rotation-x={-Math.PI / 2} raycast={() => undefined}><ringGeometry args={[Math.max(asset.footprint.width, asset.footprint.depth) * .62, Math.max(asset.footprint.width, asset.footprint.depth) * .66, 36]} /><meshBasicMaterial color="#c69466" toneMapped={false} transparent opacity={0.55} /></mesh>}
  </group>;
}
