import { describe, expect, it } from 'vitest';
import { createDefaultProject, type FurnitureInstance } from '@/editor/model/types';
import { createEditorStore } from './store';
import type { ProjectStorage } from '@/editor/serialization/project';

const object = (instanceId: string, assetId: string, x: number): FurnitureInstance => ({ instanceId, assetId, position: { x, y: 0, z: 0 }, rotationY: 0 });
const memoryStorage = (loaded: ReturnType<typeof createDefaultProject> | null = null): ProjectStorage => ({ load: () => loaded, save: () => undefined, clear: () => undefined });

describe('editor history and placement integration', () => {
  it('records one move and supports undo/redo', () => {
    const project = createDefaultProject(); project.objects = [object('sofa', 'sofa', 0)];
    const store = createEditorStore(project, memoryStorage());
    store.getState().move('sofa', { x: .5, y: 0, z: 0 });
    expect(store.getState().session.undoStack).toHaveLength(1);
    store.getState().undo(); expect(store.getState().project.objects[0]!.position.x).toBe(0);
    store.getState().redo(); expect(store.getState().project.objects[0]!.position.x).toBe(.5);
  });

  it('allows rug overlap, rejects chair/sofa overlap, and commits only the valid move', () => {
    const project = createDefaultProject();
    project.objects = [object('rug', 'rug', 0), object('sofa', 'sofa', 1), object('chair', 'chair', -1.6)];
    const store = createEditorStore(project, memoryStorage());
    store.getState().move('sofa', { x: 0, y: 0, z: 0 });
    expect(store.getState().project.objects.find((item) => item.instanceId === 'sofa')!.position.x).toBe(0);
    store.getState().move('chair', { x: 0, y: 0, z: 0 });
    expect(store.getState().project.objects.find((item) => item.instanceId === 'chair')!.position.x).toBe(-1.6);
    expect(store.getState().session.undoStack).toHaveLength(1);
  });

  it('clears history on load', () => {
    const project = createDefaultProject(); project.objects = [object('sofa', 'sofa', 0)];
    const loaded = createDefaultProject(); loaded.finishes.floorMaterialId = 'walnut';
    const store = createEditorStore(project, memoryStorage(loaded));
    store.getState().move('sofa', { x: .5, y: 0, z: 0 }); store.getState().load();
    expect(store.getState().session.undoStack).toHaveLength(0);
    expect(store.getState().project.finishes.floorMaterialId).toBe('walnut');
  });
});
