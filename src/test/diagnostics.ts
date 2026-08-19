import * as THREE from 'three';
import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec3 } from '@/editor/model/types';
import { useEditorStore } from '@/editor/state/store';
import { assetCache } from '@/scene/assets/AssetCache';

type SceneContext = { camera: THREE.Camera; gl: THREE.WebGLRenderer };
type SceneObject = { group: THREE.Group; proxy: THREE.Mesh };
export type ScreenPoint = { x: number; y: number };
export type ScreenBounds = ScreenPoint & { width: number; height: number };

let sceneContext: SceneContext | null = null;
const sceneObjects = new Map<string, SceneObject>();

export const isTestMode = import.meta.env.MODE === 'test';
export const registerTestScene = (value: SceneContext | null) => { sceneContext = value; };
export const registerTestObject = (instanceId: string, value: SceneObject | null) => {
  if (value) sceneObjects.set(instanceId, value);
  else sceneObjects.delete(instanceId);
};

const projectPoint = (point: THREE.Vector3): ScreenPoint | null => {
  if (!sceneContext) return null;
  const rect = sceneContext.gl.domElement.getBoundingClientRect();
  const projected = point.clone().project(sceneContext.camera);
  if (![projected.x, projected.y, projected.z].every(Number.isFinite)) return null;
  return {
    x: rect.left + (projected.x + 1) * rect.width / 2,
    y: rect.top + (1 - projected.y) * rect.height / 2,
  };
};

const proxyBounds = (proxy: THREE.Mesh): ScreenBounds | null => {
  const geometry = proxy.geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  proxy.updateWorldMatrix(true, false);
  const points: ScreenPoint[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const point = projectPoint(new THREE.Vector3(x, y, z).applyMatrix4(proxy.matrixWorld));
    if (point) points.push(point);
  }
  if (points.length !== 8) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};

export interface InteriorMagicTestApi {
  isReady(): boolean;
  getProject(): RoomProject;
  getSelectedInstanceId(): string | null;
  getObject(instanceId: string): FurnitureInstance | null;
  getRenderedTransform(instanceId: string): { position: Vec3; rotationY: number } | null;
  getObjectScreenPosition(instanceId: string): ScreenPoint | null;
  getInteractionProxyScreenBounds(instanceId: string): ScreenBounds | null;
  projectWorldPoint(point: Vec3): ScreenPoint | null;
  getPlacementInfo(instanceId: string): { room: RoomProject['room']; footprint: { width: number; depth: number } } | null;
  getRendererStats(): { ready: boolean; frameloop: 'demand'; calls: number; triangles: number; textures: number; geometries: number; dpr: number; canvas: ScreenBounds | null };
  getAssetCacheStats(): ReturnType<typeof assetCache.diagnostics>;
  getSessionSummary(): { interactionMode: string; undoCount: number; redoCount: number };
}

const api: InteriorMagicTestApi = {
  isReady: () => Boolean(sceneContext),
  getProject: () => structuredClone(useEditorStore.getState().project),
  getSelectedInstanceId: () => useEditorStore.getState().session.selectedId,
  getObject: (instanceId) => structuredClone(useEditorStore.getState().project.objects.find((item) => item.instanceId === instanceId) ?? null),
  getRenderedTransform: (instanceId) => {
    const group = sceneObjects.get(instanceId)?.group;
    return group ? { position: { x: group.position.x, y: group.position.y, z: group.position.z }, rotationY: group.rotation.y } : null;
  },
  getObjectScreenPosition: (instanceId) => {
    const proxy = sceneObjects.get(instanceId)?.proxy;
    return proxy ? projectPoint(proxy.getWorldPosition(new THREE.Vector3())) : null;
  },
  getInteractionProxyScreenBounds: (instanceId) => {
    const proxy = sceneObjects.get(instanceId)?.proxy;
    return proxy ? proxyBounds(proxy) : null;
  },
  projectWorldPoint: (point) => projectPoint(new THREE.Vector3(point.x, point.y, point.z)),
  getPlacementInfo: (instanceId) => {
    const object = useEditorStore.getState().project.objects.find((item) => item.instanceId === instanceId);
    return object ? { room: structuredClone(useEditorStore.getState().project.room), footprint: structuredClone(getAsset(object.assetId).footprint) } : null;
  },
  getRendererStats: () => {
    if (!sceneContext) return { ready: false, frameloop: 'demand', calls: 0, triangles: 0, textures: 0, geometries: 0, dpr: 0, canvas: null };
    const rect = sceneContext.gl.domElement.getBoundingClientRect();
    return { ready: true, frameloop: 'demand', calls: sceneContext.gl.info.render.calls, triangles: sceneContext.gl.info.render.triangles, textures: sceneContext.gl.info.memory.textures, geometries: sceneContext.gl.info.memory.geometries, dpr: sceneContext.gl.getPixelRatio(), canvas: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
  },
  getAssetCacheStats: () => assetCache.diagnostics(),
  getSessionSummary: () => { const { session } = useEditorStore.getState(); return { interactionMode: session.mode, undoCount: session.undoStack.length, redoCount: session.redoStack.length }; },
};

declare global { interface Window { __INTERIOR_MAGIC_TEST__?: InteriorMagicTestApi } }

export const installTestDiagnostics = () => {
  if (!isTestMode) return;
  window.__INTERIOR_MAGIC_TEST__ = api;
};
