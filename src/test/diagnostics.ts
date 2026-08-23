import * as THREE from 'three';
import type CameraControlsImpl from 'camera-controls';
import type { PlanProposal } from '@/editor/planning/contracts';
import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec3 } from '@/editor/model/types';
import { useEditorStore } from '@/editor/state/store';
import { assetCache } from '@/scene/assets/AssetCache';
import type { WorkspaceGeometry } from '@/app/useWorkspaceGeometry';
import { getCatalogConfiguration } from '@/editor/catalog/CatalogRepository';
import { usePlannerStore, classifyProposalOutcome, type ProposalOutcome } from '@/editor/planning/ui';
import type { PlannerApplyFailureReason } from '@/editor/planning/integration';

type SceneContext = { camera: THREE.Camera; gl: THREE.WebGLRenderer; getControls: () => CameraControlsImpl | null; getWorkspace: () => WorkspaceGeometry };
type SceneObject = { group: THREE.Group; proxy: THREE.Mesh };
export type ScreenPoint = { x: number; y: number };
export type ScreenBounds = ScreenPoint & { width: number; height: number };

let sceneContext: SceneContext | null = null;
const sceneObjects = new Map<string, SceneObject>();
let activePointerType: string | null = null;
let activePointerId: number | null = null;
let lastPointerType: string | null = null;
let lastEndReason: 'commit' | 'cancel' | null = null;

export const isTestMode = import.meta.env.MODE === 'test';
export const registerTestScene = (value: SceneContext | null) => { sceneContext = value; };
export const registerTestObject = (instanceId: string, value: SceneObject | null) => {
  if (value) sceneObjects.set(instanceId, value);
  else sceneObjects.delete(instanceId);
};
export const beginTestInteraction = (pointerType: string, pointerId: number) => {
  if (!isTestMode) return;
  activePointerType = pointerType;
  activePointerId = pointerId;
  lastPointerType = pointerType;
  lastEndReason = null;
};
export const endTestInteraction = (reason: 'commit' | 'cancel') => {
  if (!isTestMode) return;
  activePointerType = null;
  activePointerId = null;
  lastEndReason = reason;
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
  getSessionSummary(): { interactionMode: string; undoCount: number; redoCount: number; sheetState: string; workspacePanel: string | null };
  getRoomScreenBounds(): ScreenBounds | null;
  getCameraState(): { position: Vec3; target: Vec3; direction: Vec3; controlsEnabled: boolean } | null;
  getInteractionState(): { active: boolean; pointerId: number | null; pointerType: string | null; lastPointerType: string | null; lastEndReason: 'commit' | 'cancel' | null };
  getWorkspaceGeometry(): WorkspaceGeometry | null;
  getCatalogStats(): { totalEntries: number; visibleEntries: number; categories: Record<string, number>; visibleIds: string[]; placementEnabledCategories: string[] } | null;
  getPlannerSnapshot(): { status: 'idle' | 'loading' | 'ready' | 'error'; proposal: PlanProposal | null; error: string | null; applyFailure: PlannerApplyFailureReason | null; isPreviewing: boolean; outcome: ProposalOutcome | null };
  getPlannerPreviewTransform(instanceId: string): { position: Vec3; rotationY: number } | null;
  moveObjectForTest(instanceId: string, position: Vec3): void;
}

const api: InteriorMagicTestApi = {
  isReady: () => Boolean(sceneContext?.getControls()),
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
  getSessionSummary: () => { const { session } = useEditorStore.getState(); return { interactionMode: session.mode, undoCount: session.undoStack.length, redoCount: session.redoStack.length, sheetState: session.sheetState, workspacePanel: session.workspacePanel }; },
  getRoomScreenBounds: () => {
    const room = useEditorStore.getState().project.room;
    const points: ScreenPoint[] = [];
    for (const x of [-room.width / 2, room.width / 2]) for (const y of [0, room.height]) for (const z of [-room.depth / 2, room.depth / 2]) { const point = projectPoint(new THREE.Vector3(x, y, z)); if (point) points.push(point); }
    if (points.length !== 8) return null;
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  },
  getCameraState: () => {
    if (!sceneContext) return null;
    const controls = sceneContext.getControls();
    const target = controls?.getTarget(new THREE.Vector3(), false) ?? new THREE.Vector3();
    const position = sceneContext.camera.position;
    const direction = sceneContext.camera.getWorldDirection(new THREE.Vector3()).negate();
    return { position: { x: position.x, y: position.y, z: position.z }, target: { x: target.x, y: target.y, z: target.z }, direction: { x: direction.x, y: direction.y, z: direction.z }, controlsEnabled: controls?.enabled ?? false };
  },
  getInteractionState: () => ({ active: useEditorStore.getState().session.mode === 'dragging', pointerId: activePointerId, pointerType: activePointerType, lastPointerType, lastEndReason }),
  getWorkspaceGeometry: () => sceneContext ? structuredClone(sceneContext.getWorkspace()) : null,
  getCatalogStats: () => {
    const configuration = getCatalogConfiguration();
    if (!configuration) return null;
    const visibleIds = configuration.visibleIds ? [...configuration.visibleIds] : configuration.repository.list().map((item) => item.assetId);
    return { totalEntries: configuration.repository.size, visibleEntries: visibleIds.length, categories: configuration.repository.counts(), visibleIds, placementEnabledCategories: [...configuration.placementEnabledCategories] };
  },
  getPlannerSnapshot: () => {
    const state = usePlannerStore.getState();
    const outcome = state.proposal ? classifyProposalOutcome(state.proposal).outcome : null;
    return {
      status: state.status,
      proposal: state.proposal ? structuredClone(state.proposal) : null,
      error: state.error,
      applyFailure: state.applyFailure,
      isPreviewing: state.isPreviewing,
      outcome,
    };
  },
  getPlannerPreviewTransform: (instanceId) => {
    const state = usePlannerStore.getState();
    if (!state.isPreviewing || state.status !== 'ready' || !state.proposal) return null;
    const move = state.proposal.moves.find((m) => m.instanceId === instanceId);
    if (!move) return null;
    return { position: { x: move.position.x, y: 0, z: move.position.z }, rotationY: move.rotationY };
  },
  moveObjectForTest: (instanceId, position) => useEditorStore.getState().move(instanceId, position),
};

declare global { interface Window { __INTERIOR_MAGIC_TEST__?: InteriorMagicTestApi } }

export const installTestDiagnostics = () => {
  if (!isTestMode) return;
  window.__INTERIOR_MAGIC_TEST__ = api;
};
