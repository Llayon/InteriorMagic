import { describe, expect, it } from 'vitest';
import { DragController } from './DragController';
import { createDefaultProject, type FurnitureInstance } from '@/editor/model/types';

describe('DragController', () => {
  it('preserves an edge grab offset', () => {
    const project = createDefaultProject();
    const sofa: FurnitureInstance = { instanceId: 'sofa', assetId: 'sofa', position: { x: 0, y: 0, z: 0 }, rotationY: 0 };
    project.objects = [sofa];
    const drag = new DragController();
    drag.begin(1, sofa, { x: -.8, z: 0 });
    expect(drag.snapshot?.grabOffset.x).toBeCloseTo(.8);
    const preview = drag.update(1, { x: -.3, z: 0 }, project);
    expect(preview?.position.x).toBeCloseTo(.5);
    expect(drag.finish(1)?.x).toBeCloseTo(.5);
  });

  it('returns the initial transform on cancel', () => {
    const project = createDefaultProject();
    const chair: FurnitureInstance = { instanceId: 'chair', assetId: 'chair', position: { x: -.5, y: 0, z: 0 }, rotationY: 0 };
    project.objects = [chair];
    const drag = new DragController(); drag.begin(4, chair, { x: -.5, z: 0 }); drag.update(4, { x: .5, z: 0 }, project);
    expect(drag.cancel(4)).toEqual(chair.position);
  });

  it('finishes at the last valid transform after an invalid preview', () => {
    const project = createDefaultProject();
    const sofa: FurnitureInstance = { instanceId: 'sofa', assetId: 'sofa', position: { x: 0, y: 0, z: 0 }, rotationY: 0 };
    const chair: FurnitureInstance = { instanceId: 'chair', assetId: 'chair', position: { x: 1.5, y: 0, z: 0 }, rotationY: 0 };
    project.objects = [sofa, chair];
    const drag = new DragController(); drag.begin(7, sofa, { x: 0, z: 0 });
    expect(drag.update(7, { x: .1, z: 0 }, project)?.valid).toBe(true);
    expect(drag.update(7, { x: .5, z: 0 }, project)?.valid).toBe(false);
    expect(drag.finish(7)?.x).toBeCloseTo(.1);
  });
});
