import { create } from 'zustand';
import { getAsset } from '@/editor/assets/registry';
import { cloneProject, createDefaultProject, type FurnitureInstance, type RoomProject, type Vec3 } from '@/editor/model/types';
import type { CatalogCategoryId } from '@/editor/catalog/CatalogRepository';
import { findPlacement, isPlacementValid } from '@/editor/placement/placement';
import { loadInitialProject, storage, type ProjectStorage } from '@/editor/serialization/project';
import { catalogRequestGate } from '@/editor/assets/requestGate';
import type { ProposedMove } from '@/editor/planning/contracts';
import { planningProjectFingerprint } from '@/editor/planning/integration/projectFingerprint';
import type { PlannerApplyResult } from '@/editor/planning/application/types';

type Mode = 'idle' | 'dragging';
export type WorkspacePanel = 'catalog' | 'materials' | 'planner' | null;
export type SheetState = 'closed' | 'peek' | 'expanded';
export interface EditorSession {
  selectedId: string | null;
  mode: Mode;
  activeTool: 'select';
  catalogCategory: CatalogCategoryId;
  workspacePanel: WorkspacePanel;
  sheetState: SheetState;
  fitRoomRevision: number;
  undoStack: RoomProject[];
  redoStack: RoomProject[];
}
export interface EditorStore {
  project: RoomProject;
  session: EditorSession;
  select(id: string | null): void;
  setMode(mode: Mode): void;
  setCatalogCategory(category: CatalogCategoryId): void;
  setWorkspacePanel(panel: WorkspacePanel): void;
  setSheetState(state: SheetState): void;
  requestFitRoom(): void;
  add(assetId: string): string | null;
  move(id: string, position: Vec3): void;
  rotate(id: string, direction: -1 | 1): void;
  remove(id: string): void;
  duplicate(id: string): void;
  changeVariant(id: string, variantId: string): void;
  changeFinish(kind: 'floorMaterialId' | 'wallMaterialId', id: string): void;
  applyPlanningMovesAtomic(moves: readonly ProposedMove[], analyzedFingerprint: string): PlannerApplyResult;
  undo(): void;
  redo(): void;
  save(): void;
  load(): void;
  reset(): void;
}

const emptySession = (): EditorSession => ({
  selectedId: null, mode: 'idle', activeTool: 'select', catalogCategory: 'sofas', workspacePanel: 'catalog', sheetState: 'peek', fitRoomRevision: 0, undoStack: [], redoStack: [],
});
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const updateObject = (project: RoomProject, id: string, update: (object: FurnitureInstance) => FurnitureInstance): RoomProject => ({
  ...project, objects: project.objects.map((object) => object.instanceId === id ? update(object) : object),
});
const commit = (state: EditorStore, project: RoomProject) => ({
  project,
  session: {
    ...state.session,
    undoStack: [...state.session.undoStack, cloneProject(state.project)].slice(-50),
    redoStack: [],
  },
});

export const createEditorStore = (
  initialProject: RoomProject = loadInitialProject(),
  projectStorage: ProjectStorage = storage,
) => create<EditorStore>((set, get) => ({
  project: cloneProject(initialProject), session: emptySession(),
  select: (selectedId) => set((state) => ({ session: { ...state.session, selectedId } })),
  setMode: (mode) => set((state) => ({ session: { ...state.session, mode } })),
  setCatalogCategory: (catalogCategory) => set((state) => ({ session: { ...state.session, catalogCategory } })),
  setWorkspacePanel: (workspacePanel) => set((state) => ({ session: { ...state.session, workspacePanel, sheetState: workspacePanel && state.session.sheetState === 'closed' ? 'peek' : state.session.sheetState } })),
  setSheetState: (sheetState) => set((state) => ({ session: { ...state.session, sheetState, workspacePanel: sheetState === 'closed' ? null : state.session.workspacePanel ?? 'catalog' } })),
  requestFitRoom: () => set((state) => ({ session: { ...state.session, fitRoomRevision: state.session.fitRoomRevision + 1 } })),
  add(assetId) {
    const state = get();
    const position = findPlacement(state.project, assetId);
    if (!position) return null;
    const asset = getAsset(assetId);
    const object: FurnitureInstance = {
      instanceId: uid(), assetId, position: { ...position, y: 0 }, rotationY: 0, variantId: asset.variants[0]?.id,
    };
    const next = commit(state, { ...state.project, objects: [...state.project.objects, object] });
    set({ ...next, session: { ...next.session, selectedId: object.instanceId } });
    return object.instanceId;
  },
  move(id, position) {
    const state = get();
    const object = state.project.objects.find((item) => item.instanceId === id);
    if (!object || Math.hypot(object.position.x - position.x, object.position.z - position.z) < 0.001) return;
    const candidate = { ...object, position };
    if (!isPlacementValid(state.project, candidate)) return;
    set(commit(state, updateObject(state.project, id, () => candidate)));
  },
  rotate(id, direction) {
    const state = get();
    const object = state.project.objects.find((item) => item.instanceId === id);
    if (!object) return;
    const asset = getAsset(object.assetId);
    if (!asset.rotation.enabled) return;
    const candidate = { ...object, rotationY: object.rotationY + direction * asset.rotation.stepDegrees * Math.PI / 180 };
    if (isPlacementValid(state.project, candidate)) set(commit(state, updateObject(state.project, id, () => candidate)));
  },
  remove(id) {
    const state = get();
    const next = commit(state, { ...state.project, objects: state.project.objects.filter((object) => object.instanceId !== id) });
    set({ ...next, session: { ...next.session, selectedId: null } });
  },
  duplicate(id) {
    const state = get();
    const source = state.project.objects.find((object) => object.instanceId === id);
    if (!source) return;
    const position = findPlacement(state.project, source.assetId);
    if (!position) return;
    const copy = { ...source, instanceId: uid(), position: { ...position, y: 0 } };
    const next = commit(state, { ...state.project, objects: [...state.project.objects, copy] });
    set({ ...next, session: { ...next.session, selectedId: copy.instanceId } });
  },
  changeVariant(id, variantId) {
    const state = get();
    set(commit(state, updateObject(state.project, id, (object) => ({ ...object, variantId }))));
  },
  changeFinish(kind, id) {
    const state = get();
    set(commit(state, { ...state.project, finishes: { ...state.project.finishes, [kind]: id } }));
  },
  applyPlanningMovesAtomic(moves, analyzedFingerprint) {
    const state = get();
    if (moves.length === 0) return { ok: false, reason: 'invalid-proposal' };
    const ids = new Set(moves.map((move) => move.instanceId));
    if (ids.size !== moves.length || moves.some((move) =>
      !Number.isFinite(move.position.x) || !Number.isFinite(move.position.z) || !Number.isFinite(move.rotationY))) {
      return { ok: false, reason: 'invalid-proposal' };
    }
    if (planningProjectFingerprint(state.project) !== analyzedFingerprint) return { ok: false, reason: 'stale' };
    const currentById = new Map(state.project.objects.map((object) => [object.instanceId, object]));
    if (moves.some((move) => !currentById.has(move.instanceId))) return { ok: false, reason: 'missing-target' };
    const moveById = new Map(moves.map((move) => [move.instanceId, move]));
    const nextProject: RoomProject = {
      ...state.project,
      objects: state.project.objects.map((object) => {
        const move = moveById.get(object.instanceId);
        return move ? {
          ...object,
          position: { ...object.position, x: move.position.x, z: move.position.z },
          rotationY: move.rotationY,
        } : object;
      }),
    };
    try {
      const valid = nextProject.objects
        .filter((object) => ids.has(object.instanceId))
        .every((object) => isPlacementValid(nextProject, object));
      if (!valid) return { ok: false, reason: 'invalid-final-layout' };
    } catch {
      return { ok: false, reason: 'invalid-final-layout' };
    }
    set(commit(state, nextProject));
    return { ok: true };
  },
  undo() {
    const state = get();
    const previous = state.session.undoStack.at(-1);
    if (!previous) return;
    set({ project: cloneProject(previous), session: { ...state.session, selectedId: null, undoStack: state.session.undoStack.slice(0, -1), redoStack: [cloneProject(state.project), ...state.session.redoStack] } });
  },
  redo() {
    const state = get();
    const next = state.session.redoStack[0];
    if (!next) return;
    set({ project: cloneProject(next), session: { ...state.session, selectedId: null, undoStack: [...state.session.undoStack, cloneProject(state.project)], redoStack: state.session.redoStack.slice(1) } });
  },
  save() { projectStorage.save(get().project); },
  load() { catalogRequestGate.cancel(); const project = projectStorage.load(); if (project) set({ project, session: emptySession() }); },
  reset() { catalogRequestGate.cancel(); projectStorage.clear(); set({ project: createDefaultProject(), session: emptySession() }); },
}));

export const useEditorStore = createEditorStore();
