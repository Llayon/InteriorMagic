import { describe, expect, it } from 'vitest';
import { PlanningError, type PlanningEntity, type PlanningScene } from '@/editor/planning/livingRoom';
import { planOpenSpace } from './planner';

const entity = (id: string, role: PlanningEntity['role'], x: number, z: number, rotationY = 0, overrides: Partial<PlanningEntity> = {}): PlanningEntity => ({
  id, role, source: { kind: 'roomObject', instanceId: id }, placementType: 'floor',
  footprint: role === 'sofa' ? { width: 2.4, depth: 1 } : role === 'plant' ? { width: .5, depth: .5 } : { width: .9, depth: .9 },
  collision: { group: 1, mask: 1 }, transform: { position: { x, z }, rotationY }, ...overrides,
});
const scene = (entities: PlanningEntity[]): PlanningScene => ({ room: { width: 14, depth: 14 }, immediateOpeningZones: [], circulationZones: [], entities });

const cluttered = () => scene([
  entity('sofa', 'sofa', 0, 0), entity('chair', 'armchair', 4, .2), entity('table', 'coffeeTable', -.2, 3),
  entity('plant', 'plant', -3, 3), entity('lamp', 'floorLamp', 3, 3), entity('tv', 'tv', 0, 6, 0, { source: { kind: 'roomStructure', structuralId: 'tv' } }),
]);

describe('deterministic Open Space planner', () => {
  it('moves a cluttered room toward the walls and keeps fixed context unchanged', () => {
    const input = cluttered();
    const snapshot = structuredClone(input);
    const proposal = planOpenSpace(input);
    expect(proposal.moves.length).toBeGreaterThan(0);
    expect(proposal.scoreAfter.total).toBeGreaterThan(proposal.scoreBefore.total);
    expect(proposal.moves.map((move) => move.instanceId)).not.toContain('tv');
    expect(input).toEqual(snapshot);
  });

  it('is deterministic and does not move more than the bounded active group', () => {
    const input = cluttered();
    const first = planOpenSpace(input);
    expect(planOpenSpace(input)).toEqual(first);
    expect(first.moves.length).toBeGreaterThan(0);
  });

  it('keeps extra chairs and tables fixed context', () => {
    const input = cluttered();
    input.entities.push(entity('chair-far', 'armchair', 5, 5), entity('table-far', 'coffeeTable', -5, 5));
    const proposal = planOpenSpace(input);
    expect(proposal.moves.map((move) => move.instanceId)).not.toContain('chair-far');
    expect(proposal.moves.map((move) => move.instanceId)).not.toContain('table-far');
  });

  it('rejects a current arrangement with no usable path', () => {
    const input = scene([
      entity('sofa', 'sofa', 0, 0), entity('chair', 'armchair', 0, 0),
    ]);
    expect(() => planOpenSpace(input)).toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'CURRENT_LAYOUT_INVALID' }));
  });
});
