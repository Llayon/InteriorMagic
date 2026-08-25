import { describe, expect, it } from 'vitest';
import type { PlanningEntity, PlanningScene } from './PlanningScene';
import {
  runLivingRoomLayout,
  type Arrangement,
  type Candidate,
  type CandidateDimension,
  type LayoutQuality,
  type LayoutPlanRequest,
  type LayoutSelectionPolicy,
  type SelectionOutcome,
} from './engine';
import { PlanningError } from './errors';

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
  selectionPolicy: testSelectionPolicy,
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

const testSelectionPolicy: LayoutSelectionPolicy = {
  acceptanceThreshold: 4,
  movementCost: ({ movedCount, translation, rotation }) =>
    Math.min(20, movedCount * 2 + translation * 2 + rotation / (Math.PI / 4)),
};

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

  it('uses the caller selection policy for acceptance and movement cost', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = scene([movable]);
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => [candidate(movable, 'current', 0, 0), candidate(movable, 'improve', .1, 0)],
    }];
    const result = runLivingRoomLayout({
      ...request(input, [movable], dimensions, (arrangement) => [{
        id: 'quality', quality: arrangement.get('movable')?.key === 'improve' ? .51 : .5,
      }]),
      selectionPolicy: { acceptanceThreshold: 0, movementCost: () => 0 },
    });

    expect(result.selection.outcome).toBe('improved');
    expect(result.proposal.moves).toEqual([{ instanceId: 'movable', position: { x: .1, z: 0 }, rotationY: 0 }]);
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

  it('rejects opening-zone candidates unless the scenario exempts the entity', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = { ...scene([movable]), immediateOpeningZones: [{ id: 'opening', center: { x: 1.5, z: 0 }, bounds: { width: 1, depth: 1 } }] };
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => [candidate(movable, 'current', 0, 0), candidate(movable, 'opening', 1.5, 0)],
    }];
    const evaluate = (arrangement: Arrangement) => [{ id: 'quality', quality: arrangement.get('movable')?.key === 'opening' ? .9 : .5 }];
    const blocked = runLivingRoomLayout(request(input, [movable], dimensions, evaluate));
    const exempt = runLivingRoomLayout({ ...request(input, [movable], dimensions, evaluate), openingZoneExempt: (item) => item.id === 'movable' });

    expect(blocked.selection.key).toBe('movable:current');
    expect(blocked.proposal.moves).toEqual([]);
    expect(exempt.proposal.moves).toEqual([{ instanceId: 'movable', position: { x: 1.5, z: 0 }, rotationY: 0 }]);
  });

  it('returns a deterministic no-op for an empty movable group', () => {
    const result = runLivingRoomLayout(request(scene([]), [], [], () => [{ id: 'quality', quality: .5 }]));

    expect(result.proposal.moves).toEqual([]);
    expect(result.selection.outcome).toBe('already-good');
    expect(result.diagnostics.activeMovableCount).toBe(0);
    expect(result.diagnostics.arrangementsEvaluated).toBe(1);
  });

  it('reports no-valid-plan when a candidate dimension has no valid leaf', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const result = runLivingRoomLayout(request(scene([movable]), [movable], [{ entity: movable, provide: () => [] }], () => [{ id: 'quality', quality: .5 }]));

    expect(result.selection.outcome).toBe('no-valid-plan');
    expect(result.proposal.moves).toEqual([]);
    expect(result.proposal.scoreAfter).toEqual(result.proposal.scoreBefore);
  });

  it('keeps repeated tie proposals identical across multiple dimensions', () => {
    const first = entity('first', 'sofa', -1, 0);
    const second = entity('second', 'armchair', 1, 0);
    const input = scene([first, second]);
    const dimensions: CandidateDimension[] = [
      { entity: first, provide: () => [candidate(first, 'current', -1, 0), candidate(first, 'duplicate', -1, 0)] },
      { entity: second, provide: () => [candidate(second, 'current', 1, 0), candidate(second, 'duplicate', 1, 0)] },
    ];
    const evaluateTie = () => [{ id: 'quality', quality: .5 }];
    const firstRun = runLivingRoomLayout(request(input, [first, second], dimensions, evaluateTie));
    const secondRun = runLivingRoomLayout(request(input, [first, second], dimensions, evaluateTie));

    expect(firstRun.proposal).toEqual(secondRun.proposal);
    expect(firstRun.selection.key).toBe('first:current|second:current');
  });

  it('stops exhaustive evaluation at the configured search budget', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = scene([movable]);
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => [candidate(movable, 'current', 0, 0), candidate(movable, 'alternate', .5, 0)],
    }];
    const result = runLivingRoomLayout({
      ...request(input, [movable], dimensions, () => [{ id: 'quality', quality: .5 }]),
      searchLimits: { maxEvaluations: 1 },
    });

    expect(result.diagnostics.arrangementsEvaluated).toBe(1);
    expect(result.diagnostics.stoppedByBudget).toBe(true);
  });

  it('fails closed when the search budget is exhausted before characterization completes', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = scene([movable]);
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      // The first leaf is attractive, but it is not safe to apply a partial search result.
      provide: () => [candidate(movable, 'improve-first', .5, 0), candidate(movable, 'current', 0, 0)],
    }];
    const requestWithBudget = {
      ...request(input, [movable], dimensions, (arrangement) => [{
        id: 'quality', quality: arrangement.get('movable')?.key === 'improve-first' ? 1 : .5,
      }]),
      selectionPolicy: { acceptanceThreshold: 0, movementCost: () => 0 },
      searchLimits: { maxEvaluations: 1 },
      buildFindings: (_before: LayoutQuality, _after: LayoutQuality, outcome: SelectionOutcome) => [{
        ruleId: 'layout.selection', code: `layout-${outcome}`, severity: outcome === 'search-incomplete' ? 'info' as const : 'positive' as const,
      }],
    };
    const first = runLivingRoomLayout(requestWithBudget);
    const second = runLivingRoomLayout(requestWithBudget);

    expect(first.diagnostics.stoppedByBudget).toBe(true);
    expect(first.selection.outcome).toBe('search-incomplete');
    expect(first.proposal.moves).toEqual([]);
    expect(first.proposal.scoreAfter).toEqual(first.proposal.scoreBefore);
    expect(first.proposal.findings).toEqual([expect.objectContaining({ code: 'layout-search-incomplete', severity: 'info' })]);
    expect(second).toEqual(first);
  });

  it('applies a complete search when the configured budget covers every leaf', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    const input = scene([movable]);
    const dimensions: CandidateDimension[] = [{
      entity: movable,
      provide: () => [candidate(movable, 'current', 0, 0), candidate(movable, 'improve', .5, 0)],
    }];
    const result = runLivingRoomLayout({
      ...request(input, [movable], dimensions, (arrangement) => [{
        id: 'quality', quality: arrangement.get('movable')?.key === 'improve' ? 1 : .5,
      }]),
      selectionPolicy: { acceptanceThreshold: 0, movementCost: () => 0 },
      searchLimits: { maxEvaluations: 2 },
    });

    expect(result.diagnostics.arrangementsEvaluated).toBe(2);
    expect(result.diagnostics.stoppedByBudget).toBe(false);
    expect(result.selection.outcome).toBe('improved');
    expect(result.proposal.moves).toEqual([{ instanceId: 'movable', position: { x: .5, z: 0 }, rotationY: 0 }]);
  });

  it('reports typed errors for invalid active groups and current layouts', () => {
    const movable = entity('movable', 'sofa', 0, 0);
    expect(() => runLivingRoomLayout(request(scene([movable]), [movable, movable], [], () => [])))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'INVALID_ACTIVE_GROUP' }));

    const invalidScene = { ...scene([movable]), immediateOpeningZones: [{ id: 'opening', center: { x: 0, z: 0 }, bounds: { width: 1, depth: 1 } }] };
    expect(() => runLivingRoomLayout(request(invalidScene, [movable], [{ entity: movable, provide: () => [candidate(movable, 'current', 0, 0)] }], () => [])))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'CURRENT_LAYOUT_INVALID' }));

    expect(() => runLivingRoomLayout({
      ...request(scene([movable]), [movable], [{ entity: movable, provide: () => [candidate(movable, 'current', 0, 0)] }], () => []),
      searchLimits: { maxEvaluations: 0 },
    })).toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'SEARCH_LIMIT_EXCEEDED' }));
  });
});
