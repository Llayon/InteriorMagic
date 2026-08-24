import { describe, expect, it } from 'vitest';
import type { PlanningEntity, PlanningScene } from './PlanningScene';
import {
  runLivingRoomLayout,
  type Arrangement,
  type Candidate,
  type CandidateDimension,
  type LayoutPlanRequest,
} from './engine';

const entity = (
  id: string,
  role: PlanningEntity['role'],
  x: number,
  z: number,
  width = .8,
  depth = .8,
): PlanningEntity => ({
  id,
  source: { kind: 'roomObject', instanceId: id },
  role,
  placementType: 'floor',
  footprint: { width, depth },
  collision: { group: 1, mask: 1 },
  transform: { position: { x, z }, rotationY: 0 },
});

const scene = (entities: PlanningEntity[]): PlanningScene => ({
  room: { width: 6, depth: 6 },
  immediateOpeningZones: [],
  circulationZones: [],
  entities,
});

const request = (
  input: PlanningScene,
  movable: PlanningEntity[],
  dimensions: CandidateDimension[],
  evaluateRules: LayoutPlanRequest['evaluateRules'],
): LayoutPlanRequest => ({
  scene: input,
  activeGroup: {
    participants: movable,
    movable,
    fixedContext: input.entities.filter((item) => !movable.some((active) => active.id === item.id)),
  },
  dimensions,
  evaluateRules,
  ruleWeights: [{ id: 'quality', weight: 1 }],
  buildFindings: () => [],
});

const candidate = (entity: PlanningEntity, key: string, x: number, z: number): Candidate => ({
  key,
  position: { x, z },
  rotationY: entity.transform.rotationY,
});

const quality = (arrangement: Arrangement) => [{
  id: 'quality',
  quality: arrangement.get('movable')?.key === 'improve' ? .9 : .5,
}];

describe('scenario-neutral living-room layout engine', () => {
  it('is deterministic, preserves candidate order, and uses the lexical tie-break', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = scene([movable]);
    const providedOrders: string[] = [];
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => {
        const candidates = [
          candidate(movable, 'current', 0, 0),
          candidate(movable, 'b', .5, 0),
          candidate(movable, 'a', .5, 0),
        ];
        providedOrders.push(candidates.map((item) => item.key).join(','));
        return candidates;
      },
    }];
    const evaluateTie = (arrangement: Arrangement) => [{
      id: 'quality', quality: arrangement.get('movable')?.key === 'current' ? .5 : .9,
    }];
    const first = runLivingRoomLayout(request(input, [movable], dimensions, evaluateTie));
    const second = runLivingRoomLayout(request(input, [movable], dimensions, evaluateTie));

    expect(first).toEqual(second);
    expect(first.selection.key).toBe('movable:a');
    expect(first.diagnostics.arrangementsEvaluated).toBe(3);
    expect(providedOrders).toEqual(['current,b,a', 'current,b,a']);
  });

  it('accounts for movement cost and rejects a sub-threshold improvement', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = scene([movable]);
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => [candidate(movable, 'current', 0, 0), candidate(movable, 'improve', .1, 0)],
    }];
    const result = runLivingRoomLayout(request(input, [movable], dimensions, (arrangement) => [{
      id: 'quality', quality: arrangement.get('movable')?.key === 'improve' ? .51 : .5,
    }]));

    expect(result.proposal.moves).toEqual([]);
    expect(result.selection.outcome).toBe('improvement-too-small');
    expect(result.proposal.scoreAfter).toEqual(result.proposal.scoreBefore);
  });

  it('keeps fixed context outside candidate dimensions and rejects context collisions', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const obstacle = entity('obstacle', 'obstacle', 1.5, 0, 1, 1);
    const input = scene([movable, obstacle]);
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => [candidate(movable, 'current', 0, 0), candidate(movable, 'blocked', 1.5, 0)],
    }];
    const result = runLivingRoomLayout(request(input, [movable], dimensions, quality));

    expect(result.diagnostics.roomEntityCount).toBe(2);
    expect(result.diagnostics.activeMovableCount).toBe(1);
    expect(result.diagnostics.candidateDimensionCount).toBe(1);
    expect(result.proposal.moves).toEqual([]);
    expect(result.selection.key).toBe('movable:current');
  });

  it('rejects active collisions and out-of-room candidates', () => {
    const first = entity('first', 'sofa', -1, 0);
    const second = entity('second', 'armchair', 1, 0);
    const input = scene([first, second]);
    const dimensions: CandidateDimension[] = [
      { entity: first, provide: () => [candidate(first, 'current', -1, 0), candidate(first, 'outside', -4, 0)] },
      { entity: second, provide: () => [candidate(second, 'current', 1, 0), candidate(second, 'colliding', -1, 0)] },
    ];
    const result = runLivingRoomLayout(request(input, [first, second], dimensions, quality));

    expect(result.proposal.moves).toEqual([]);
    expect(result.selection.key).toBe('first:current|second:current');
    expect(result.diagnostics.arrangementsEvaluated).toBe(1);
  });
});
