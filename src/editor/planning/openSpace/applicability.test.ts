import { describe, expect, it } from 'vitest';
import type { PlanningEntity, PlanningScene } from '@/editor/planning/livingRoom';
import { validateOpenSpaceApplicability } from './applicability';

const entity = (id: string, role: PlanningEntity['role'], x: number, z: number, overrides: Partial<PlanningEntity> = {}): PlanningEntity => ({
  id, role, source: { kind: 'roomObject', instanceId: id }, placementType: 'floor',
  footprint: { width: role === 'sofa' ? 2 : .8, depth: role === 'sofa' ? 1 : .8 },
  collision: { group: 1, mask: 1 }, transform: { position: { x, z }, rotationY: 0 }, ...overrides,
});
const scene = (entities: PlanningEntity[]): PlanningScene => ({ room: { width: 10, depth: 10 }, immediateOpeningZones: [], circulationZones: [], entities });

describe('Open Space active-group selection', () => {
  it('selects one nearest chair and coffee table, while retaining all eligible decor', () => {
    const result = validateOpenSpaceApplicability(scene([
      entity('sofa', 'sofa', 0, 0), entity('chair-near', 'armchair', 1, 0), entity('chair-far', 'armchair', 4, 0),
      entity('table-near', 'coffeeTable', 1, 1), entity('table-far', 'coffeeTable', 4, 1),
      entity('plant', 'plant', -3, -3), entity('tv', 'tv', 0, 4),
    ]));
    expect(result.armchair?.id).toBe('chair-near');
    expect(result.coffeeTable?.id).toBe('table-near');
    expect(result.decor.map((item) => item.id)).toEqual(['plant']);
    expect(result.movable.map((item) => item.id)).toEqual(['sofa', 'chair-near', 'table-near', 'plant']);
  });

  it('prefers eligible floor room objects and leaves wall or derived items fixed', () => {
    const result = validateOpenSpaceApplicability(scene([
      entity('sofa', 'sofa', 0, 0),
      entity('wall-plant', 'plant', 0, 0, { placementType: 'wall' }),
      entity('derived-plant', 'plant', 1, 0, { source: { kind: 'derived' } }),
      entity('floor-plant', 'plant', 2, 0),
    ]));
    expect(result.decor.map((item) => item.id)).toEqual(['floor-plant']);
  });

  it('fails closed without exactly one movable sofa', () => {
    expect(() => validateOpenSpaceApplicability(scene([entity('chair', 'armchair', 0, 0)]))).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_LAYOUT' }));
    expect(() => validateOpenSpaceApplicability(scene([
      entity('sofa-a', 'sofa', -1, 0), entity('sofa-b', 'sofa', 1, 0),
    ]))).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_LAYOUT' }));
  });
});
