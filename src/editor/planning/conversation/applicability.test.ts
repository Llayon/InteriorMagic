import { describe, expect, it } from 'vitest';
import type { PlanningEntity, PlanningScene } from '@/editor/planning/livingRoom';
import { validateConversationApplicability } from './applicability';

const entity = (
  id: string,
  role: PlanningEntity['role'],
  x: number,
  z: number,
  overrides: Partial<PlanningEntity> = {},
): PlanningEntity => ({
  id,
  source: { kind: 'roomObject', instanceId: id },
  role,
  placementType: 'floor',
  footprint: { width: role === 'sofa' ? 2 : .8, depth: role === 'sofa' ? 1 : .8 },
  collision: { group: 1, mask: 1 },
  transform: { position: { x, z }, rotationY: 0 },
  ...overrides,
});

const scene = (entities: PlanningEntity[]): PlanningScene => ({
  room: { width: 8, depth: 8 }, immediateOpeningZones: [], circulationZones: [], entities,
});

describe('Conversation active-group selection', () => {
  it('takes the two nearest armchairs and resolves equal distances lexically', () => {
    const result = validateConversationApplicability(scene([
      entity('sofa', 'sofa', 0, 0),
      entity('chair-b', 'armchair', 1, 0),
      entity('chair-a', 'armchair', -1, 0),
      entity('chair-far', 'armchair', 3, 0),
    ]));
    expect(result.armchairs.map((chair) => chair.id)).toEqual(['chair-a', 'chair-b']);
  });

  it('selects eligible armchairs before applying the nearest-two policy', () => {
    const result = validateConversationApplicability(scene([
      entity('sofa', 'sofa', 0, 0),
      entity('chair-wall-nearest', 'armchair', .5, 0, { placementType: 'wall' }),
      entity('chair-derived-near', 'armchair', 1, 0, { source: { kind: 'derived' } }),
      entity('chair-valid-a', 'armchair', 1.5, 0),
      entity('chair-valid-b', 'armchair', 2, 0),
    ]));

    expect(result.armchairs.map((chair) => chair.id)).toEqual(['chair-valid-a', 'chair-valid-b']);
  });

  it('fails closed when semantic armchairs exist but none is movable-compatible', () => {
    expect(() => validateConversationApplicability(scene([
      entity('sofa', 'sofa', 0, 0),
      entity('chair-wall', 'armchair', .5, 0, { placementType: 'wall' }),
      entity('chair-structure', 'armchair', 1, 0, { source: { kind: 'roomStructure', structuralId: 'chair-structure' } }),
    ]))).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_LAYOUT' }));
  });
});
