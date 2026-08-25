import { describe, expect, it } from 'vitest';
import { PlanningError } from '@/editor/planning/errors';
import type { PlanningEntity, PlanningScene } from '@/editor/planning/livingRoom';
import { planConversation } from './planner';

const entity = (
  id: string,
  role: PlanningEntity['role'],
  x: number,
  z: number,
  rotationY = 0,
  source: PlanningEntity['source'] = { kind: 'roomObject', instanceId: id },
): PlanningEntity => ({
  id,
  source,
  role,
  placementType: 'floor',
  footprint: role === 'sofa' ? { width: 2, depth: 1 } : { width: .8, depth: .8 },
  collision: { group: 1, mask: 1 },
  transform: { position: { x, z }, rotationY },
});

const scene = (entities: PlanningEntity[]): PlanningScene => ({
  room: { width: 8, depth: 8 },
  immediateOpeningZones: [],
  circulationZones: [],
  entities,
});

const poorOneChair = () => scene([
  entity('sofa', 'sofa', 0, -2),
  entity('chair', 'armchair', 2.8, 2.5, Math.PI),
]);

describe('deterministic Conversation planner', () => {
  it('improves a one-sofa, one-armchair conversation group', () => {
    const proposal = planConversation(poorOneChair());
    expect(proposal.moves.length).toBeGreaterThan(0);
    expect(proposal.moves.map((move) => move.instanceId)).toEqual(expect.arrayContaining(['sofa', 'chair']));
    expect(proposal.scoreAfter.total).toBeGreaterThan(proposal.scoreBefore.total);
    expect(proposal.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'conversation.facing' }),
      expect.objectContaining({ ruleId: 'conversation.distance' }),
    ]));
  });

  it('supports two armchairs and keeps unrelated context fixed', () => {
    const input = poorOneChair();
    input.entities.push(entity('chair-2', 'armchair', -2.8, 2.5, Math.PI));
    input.entities.push(entity('coffee-table', 'coffeeTable', 0, -.2));
    input.entities.push(entity('plant', 'plant', 3, -3));
    const proposal = planConversation(input);
    expect(proposal.moves.map((move) => move.instanceId).sort()).toEqual(['chair', 'chair-2', 'sofa']);
    expect(proposal.moves.some((move) => move.instanceId === 'coffee-table')).toBe(false);
    expect(proposal.moves.some((move) => move.instanceId === 'plant')).toBe(false);
  });

  it('selects only the two nearest armchairs from a larger fixed context', () => {
    const input = poorOneChair();
    input.entities.push(entity('chair-2', 'armchair', -2.8, 2.5, Math.PI));
    input.entities.push(entity('chair-3', 'armchair', 3.2, -1.5));
    const proposal = planConversation(input);
    expect(proposal.moves.map((move) => move.instanceId)).not.toContain('chair-3');
  });

  it('returns a deterministic no-op for an already-good group', () => {
    const input = scene([
      entity('sofa', 'sofa', 0, -1.5),
      entity('chair', 'armchair', 1.55, -.15, Math.atan2(-1.55, -1.35)),
    ]);
    const first = planConversation(input);
    const second = planConversation(input);
    expect(first).toEqual(second);
    expect(first.moves).toEqual([]);
  });

  it('does not move a chair through a fixed collision obstacle', () => {
    const input = poorOneChair();
    input.entities.push(entity('cabinet', 'obstacle', 1.55, -1.35));
    const proposal = planConversation(input);
    expect(proposal.moves.some((move) => move.instanceId === 'cabinet')).toBe(false);
  });

  it('rejects unsupported conversation topology and provenance with typed errors', () => {
    expect(() => planConversation(scene([entity('sofa', 'sofa', 0, -2)])))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_LAYOUT' }));
    expect(() => planConversation(scene([
      entity('sofa', 'sofa', 0, -2),
      entity('chair', 'armchair', 2.8, 2.5, Math.PI, { kind: 'derived' }),
    ]))).toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'INVALID_ACTIVE_GROUP' }));
  });

  it('does not mutate the scene and produces the same proposal repeatedly', () => {
    const input = poorOneChair();
    const snapshot = structuredClone(input);
    const first = planConversation(input);
    expect(planConversation(input)).toEqual(first);
    expect(input).toEqual(snapshot);
  });
});
