import { describe, expect, it } from 'vitest';
import type { RoomProject } from '@/editor/model/types';
import { planningProjectFingerprint } from '@/editor/planning/integration/projectFingerprint';
import type { ProposedMove } from '@/editor/planning/contracts';
import type { ProjectStorage } from '@/editor/serialization/project';
import { createEditorStore } from './store';

const storage: ProjectStorage = { load: () => null, save: () => undefined, clear: () => undefined };
const project = (): RoomProject => ({
  version: 1, room: { width: 6, depth: 6, height: 2.7 }, finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
  objects: [
    { instanceId: 'a', assetId: 'chair', position: { x: -1, y: .2, z: 0 }, rotationY: 0 },
    { instanceId: 'b', assetId: 'chair', position: { x: 1, y: .3, z: 0 }, rotationY: Math.PI },
  ],
});
const swap: ProposedMove[] = [
  { instanceId: 'a', position: { x: 1, z: 0 }, rotationY: Math.PI },
  { instanceId: 'b', position: { x: -1, z: 0 }, rotationY: 0 },
];

describe('atomic planning Apply', () => {
  it('applies 2+ simultaneous moves with one history entry and exact Undo/Redo', () => {
    const initial = project();
    const store = createEditorStore(initial, storage);
    store.getState().select('a');
    const result = store.getState().applyPlanningMovesAtomic(swap, planningProjectFingerprint(initial));
    expect(result).toEqual({ ok: true });
    expect(store.getState().session.undoStack).toHaveLength(1);
    expect(store.getState().session.selectedId).toBe('a');
    expect(store.getState().project.objects.map((object) => object.position.x)).toEqual([1, -1]);
    expect(store.getState().project.objects.map((object) => object.position.y)).toEqual([.2, .3]);
    const applied = structuredClone(store.getState().project);
    store.getState().undo();
    expect(store.getState().project).toEqual(initial);
    store.getState().redo();
    expect(store.getState().project).toEqual(applied);
  });

  it.each([
    ['duplicate IDs', [swap[0]!, swap[0]!], 'invalid-proposal'],
    ['missing target', [{ instanceId: 'missing', position: { x: 0, z: 0 }, rotationY: 0 }], 'missing-target'],
    ['non-finite transform', [{ instanceId: 'a', position: { x: Number.NaN, z: 0 }, rotationY: 0 }], 'invalid-proposal'],
    ['collision in final layout', [
      { instanceId: 'a', position: { x: 0, z: 0 }, rotationY: 0 },
      { instanceId: 'b', position: { x: 0, z: 0 }, rotationY: 0 },
    ], 'invalid-final-layout'],
    ['room-bound violation', [{ instanceId: 'a', position: { x: 10, z: 0 }, rotationY: 0 }], 'invalid-final-layout'],
  ] as const)('rejects %s without changing project or history', (_label, moves, reason) => {
    const initial = project();
    const store = createEditorStore(initial, storage);
    const beforeProject = structuredClone(store.getState().project);
    const beforeSession = structuredClone(store.getState().session);
    expect(store.getState().applyPlanningMovesAtomic(moves, planningProjectFingerprint(initial))).toEqual({ ok: false, reason });
    expect(store.getState().project).toEqual(beforeProject);
    expect(store.getState().session).toEqual(beforeSession);
  });

  it('rejects a stale fingerprint without changing existing undo or redo history', () => {
    const initial = project();
    const store = createEditorStore(initial, storage);
    store.getState().move('a', { x: -1.5, y: .2, z: 0 });
    store.getState().undo();
    const beforeProject = structuredClone(store.getState().project);
    const beforeSession = structuredClone(store.getState().session);
    expect(store.getState().applyPlanningMovesAtomic(swap, 'stale-fingerprint')).toEqual({ ok: false, reason: 'stale' });
    expect(store.getState().project).toEqual(beforeProject);
    expect(store.getState().session).toEqual(beforeSession);
    expect(store.getState().session.redoStack).toHaveLength(1);
  });
});
