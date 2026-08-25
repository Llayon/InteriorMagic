import { describe, expect, it } from 'vitest';
import type { PlanningEntity, PlanningScene } from '@/editor/planning/livingRoom';
import { validateConversationApplicability } from './applicability';

const entity = (id: string, role: PlanningEntity['role'], x: number, z: number): PlanningEntity => ({
  id,
  source: { kind: 'roomObject', instanceId: id },
  role,
  placementType: 'floor',
  footprint: { width: role === 'sofa' ? 2 : .8, depth: role === 'sofa' ? 1 : .8 },
  collision: { group: 1, mask: 1 },
  transform: { position: { x, z }, rotationY: 0 },
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
});
