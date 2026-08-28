import { describe, expect, it } from 'vitest';
import { ObjectTransformController } from './ObjectTransformController';
import { createDefaultProject, type FurnitureInstance } from '@/editor/model/types';

const chair: FurnitureInstance = { instanceId: 'chair', assetId: 'chair', position: { x: 0, y: 0, z: 0 }, rotationY: 0 };
const sample = (id: number, x: number, y: number) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
describe('ObjectTransformController', () => {
  it('uses pair angle only and ignores pinch distance', () => {
    const project = createDefaultProject(); project.objects = [chair]; const c = new ObjectTransformController();
    expect(c.begin(sample(1, 10, 10), chair, { x: 0, z: 0 }, project)).toBe(true); c.addPointer(sample(2, 20, 10));
    const first = c.update(sample(2, 30, 10), null)!; const second = c.update(sample(2, 40, 10), null)!;
    expect(second.rotationY).toBeCloseTo(first.rotationY); expect(c.release(1)).toBeNull(); expect(c.mode).toBe('draining'); expect(c.release(2)?.changed).toBe(false);
  });
  it('cancels without mutating a transform', () => { const project = createDefaultProject(); project.objects = [chair]; const c = new ObjectTransformController(); c.begin(sample(1, 0, 0), chair, { x: 0, z: 0 }, project); c.addPointer(sample(2, 10, 0)); c.update(sample(2, 10, 10), null); expect(c.cancel()?.position).toEqual(chair.position); });
});
