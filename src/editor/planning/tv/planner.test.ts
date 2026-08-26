import { describe, expect, it } from 'vitest';
import type { WatchTvGoalV2 } from '../contracts/types';
import { planTvViewing, planTvViewingWithLegacyPriorities } from './planner';
import type { PlanningEntity, PlanningScene } from './PlanningScene';
import { PlanningError } from '@/editor/planning/errors';
import { TV_SELECTION_POLICY } from './constants';

const entity = (id: string, role: PlanningEntity['role'], x: number, z: number, rotationY: number, width: number, depth: number): PlanningEntity => ({
  id, source: role === 'tv' ? { kind: 'derived' } : { kind: 'roomObject', instanceId: `source-${id}` }, role, placementType: role === 'tv' ? 'wall' : 'floor',
  footprint: { width, depth }, collision: role === 'tv' ? { group: 0, mask: 0 } : { group: 1, mask: 1 }, transform: { position: { x, z }, rotationY },
});

const scene = (overrides: Partial<PlanningScene> = {}): PlanningScene => ({
  room: { width: 6, depth: 6 }, immediateOpeningZones: [], circulationZones: [],
  entities: [
    entity('tv', 'tv', 0, 2.8, Math.PI, 1.2, .1),
    entity('sofa', 'sofa', 0, -2.1, 0, 2, .9),
    entity('chair', 'armchair', -1.6, -.5, Math.PI / 2, .8, .8),
    entity('table', 'coffeeTable', 0, -.9, 0, 1, .6),
  ],
  ...overrides,
});
const goal: WatchTvGoalV2 = { activity: 'watchTv', focalPointId: 'tv' };

describe('deterministic TV planner', () => {
  it('keeps the characterized TV selection policy values', () => {
    expect(TV_SELECTION_POLICY.acceptanceThreshold).toBe(4);
    expect(TV_SELECTION_POLICY.movementCost({ movedCount: 1, translation: .5, rotation: Math.PI / 4 })).toBe(4);
    expect(TV_SELECTION_POLICY.movementCost({ movedCount: 10, translation: 10, rotation: Math.PI * 4 })).toBe(20);
  });

  it('keeps TV topology policy in the TV facade after scene projection', () => {
    const input = scene({ entities: [
      ...scene().entities,
      entity('chair-2', 'armchair', 1.6, -.5, -Math.PI / 2, .8, .8),
      entity('chair-3', 'armchair', 2.2, .5, -Math.PI / 2, .8, .8),
    ] });
    expect(() => planTvViewing(input, goal)).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_LAYOUT' }));
  });

  it('repairs a badly oriented sofa and reports pure quality', () => {
    const input = scene();
    input.entities.find((item) => item.role === 'sofa')!.transform.rotationY = Math.PI;
    const proposal = planTvViewing(input, goal);
    expect(proposal.moves.some((move) => move.instanceId === 'source-sofa')).toBe(true);
    expect(proposal.scoreAfter.total).toBeGreaterThan(proposal.scoreBefore.total);
    expect(proposal.findings).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'tv-viewing.orientation', code: 'good-orientation' })]));
  });

  it('moves a circulation-obstructing table', () => {
    const input = scene({ circulationZones: [{ id: 'path', center: { x: 0, z: -.9 }, bounds: { width: 1.2, depth: 1.2 } }] });
    const proposal = planTvViewingWithLegacyPriorities(input, goal, ['circulation', 'viewing', 'conversation']);
    expect(proposal.moves.some((move) => move.instanceId === 'source-table')).toBe(true);
    expect(proposal.findings).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'room.circulation', code: 'circulation-improved' })]));
  });

  it('improves a poorly positioned armchair conversation slot', () => {
    const input = scene();
    const chair = input.entities.find((item) => item.role === 'armchair')!;
    chair.transform.position = { x: 2.5, z: 2.3 }; chair.transform.rotationY = 0;
    const proposal = planTvViewingWithLegacyPriorities(input, goal, ['conversation', 'viewing', 'circulation']);
    expect(proposal.moves.some((move) => move.instanceId === 'source-chair')).toBe(true);
  });

  it('gives an awkward open-room sofa wall support', () => {
    const input = scene({ entities: [
      entity('tv', 'tv', 0, .4, Math.PI, 1.2, .1),
      entity('sofa', 'sofa', 0, 0, 0, 2, .9),
    ] });
    const sofa = input.entities.find((item) => item.role === 'sofa')!;
    const proposal = planTvViewing(input, goal);
    expect(proposal.moves.some((move) => move.instanceId === 'source-sofa')).toBe(true);
    const moved = proposal.moves.find((move) => move.instanceId === 'source-sofa')!;
    const movedEntity = { ...sofa, transform: moved };
    const extent = Math.abs(Math.cos(moved.rotationY)) * movedEntity.footprint.width / 2 + Math.abs(Math.sin(moved.rotationY)) * movedEntity.footprint.depth / 2;
    const xGap = input.room.width / 2 - Math.abs(moved.position.x) - extent;
    expect(xGap < .101 || Math.abs(input.room.depth / 2 - Math.abs(moved.position.z) - (Math.abs(Math.sin(moved.rotationY)) * sofa.footprint.width / 2 + Math.abs(Math.cos(moved.rotationY)) * sofa.footprint.depth / 2)) < .101).toBe(true);
  });

  it('returns an already-good no-op when movement cannot earn four utility points', () => {
    const input = scene({
      room: { width: 6, depth: 4.1 },
      entities: [entity('tv', 'tv', 0, 1, Math.PI, 1.2, .1), entity('sofa', 'sofa', 0, -1.5, 0, 2, .9)],
    });
    const proposal = planTvViewing(input, goal);
    expect(proposal.moves).toEqual([]);
    expect(proposal.scoreAfter).toEqual(proposal.scoreBefore);
    expect(proposal.findings).toEqual([expect.objectContaining({ ruleId: 'layout.selection', code: 'layout-already-good' })]);
  });

  it('distinguishes a sub-threshold improvement from an already-good layout', () => {
    const input = scene({
      room: { width: 6, depth: 4.1 },
      entities: [entity('tv', 'tv', 0, 1, Math.PI, 1.2, .1), entity('sofa', 'sofa', 0, -1.5, .03, 2, .9)],
    });
    const proposal = planTvViewing(input, goal);
    expect(proposal.moves).toEqual([]);
    expect(proposal.findings).toEqual([expect.objectContaining({ code: 'layout-improvement-too-small' })]);
  });

  it('excludes non-applicable conversation and circulation rules neutrally', () => {
    const input = scene({ entities: [entity('tv', 'tv', 0, 2.8, Math.PI, 1.2, .1), entity('sofa', 'sofa', 0, -2.1, 0, 2, .9)] });
    const withoutRules = planTvViewing(input, goal).scoreBefore.total;
    input.circulationZones = [];
    expect(planTvViewing(input, goal).scoreBefore.total).toBeCloseTo(withoutRules);
    expect(withoutRules).toBeGreaterThan(0);
  });

  it('uses priority order to reassign fixed weight slots', () => {
    const input = scene({ circulationZones: [{ id: 'path', center: { x: 0, z: -.9 }, bounds: { width: 1.2, depth: 1.2 } }] });
    const circulationFirst = planTvViewingWithLegacyPriorities(input, goal, ['circulation', 'viewing', 'conversation']);
    const viewingFirst = planTvViewing(input, goal);
    expect(circulationFirst.scoreBefore.total).not.toBeCloseTo(viewingFirst.scoreBefore.total);
  });

  it('appends omitted default priorities after an explicit ordered subset', () => {
    const input = scene({ circulationZones: [{ id: 'path', center: { x: 0, z: -.9 }, bounds: { width: 1.2, depth: 1.2 } }] });
    expect(planTvViewingWithLegacyPriorities(input, goal, ['circulation']))
      .toEqual(planTvViewingWithLegacyPriorities(input, goal, ['circulation', 'viewing', 'conversation']));
    expect(planTvViewingWithLegacyPriorities(input, goal, ['conversation', 'viewing']))
      .toEqual(planTvViewingWithLegacyPriorities(input, goal, ['conversation', 'viewing', 'circulation']));
  });

  it('rejects an invalid current arrangement and incompatible placement candidates', () => {
    const blocked = scene({ immediateOpeningZones: [{ id: 'door', center: { x: 0, z: 0 }, bounds: { width: 5.8, depth: 5.8 } }] });
    expect(() => planTvViewing(blocked, goal)).toThrow('Current PlanningScene arrangement violates hard constraints');
    const incompatible = scene();
    incompatible.entities.find((item) => item.role === 'armchair')!.placementType = 'wall';
    expect(() => planTvViewing(incompatible, goal)).toThrow('Unsupported placement type');
  });

  it('normalizes TV precondition failures to PlanningError codes', () => {
    expect(() => planTvViewing(scene(), { ...goal, focalPointId: 'missing' }))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'FOCAL_NOT_FOUND' }));

    const noSofa = scene({ entities: [scene().entities[0]!] });
    expect(() => planTvViewing(noSofa, goal))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_LAYOUT' }));

    const incompatible = scene();
    incompatible.entities.find((item) => item.role === 'armchair')!.placementType = 'wall';
    expect(() => planTvViewing(incompatible, goal))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_PLACEMENT' }));

    const unsupportedSource = scene();
    unsupportedSource.entities.find((item) => item.role === 'sofa')!.source = { kind: 'derived' };
    expect(() => planTvViewing(unsupportedSource, goal))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'INVALID_ACTIVE_GROUP' }));
  });

  it('is deterministic, resolves focal identity only by planning ID, and does not mutate input', () => {
    const input = scene();
    const snapshot = structuredClone(input);
    expect(planTvViewing(input, goal)).toEqual(planTvViewing(input, goal));
    expect(input).toEqual(snapshot);
    expect(() => planTvViewing(input, { ...goal, focalPointId: 'missing' })).toThrow('resolve unique TV focal');
    expect(() => planTvViewing(input, { ...goal, focalPointId: 'source-tv' })).toThrow('resolve unique TV focal');
  });

  it('only rewards a wall behind canonical -Z, not a nearby side wall', () => {
    const supported = scene({ room: { width: 6, depth: 4.1 }, entities: [
      entity('tv', 'tv', 0, 1, Math.PI, 1.2, .1),
      entity('sofa', 'sofa', 0, -1.5, 0, 2, .9),
    ] });
    const sideOnly = structuredClone(supported);
    sideOnly.entities[1]!.transform.position = { x: -1.9, z: 0 };
    expect(planTvViewing(supported, goal).scoreBefore.total).toBeGreaterThan(planTvViewing(sideOnly, goal).scoreBefore.total);
  });

  it('uses neutral rear-boundary findings without misleading scoreImpact', () => {
    const input = scene({ entities: [
      entity('tv', 'tv', 0, .4, Math.PI, 1.2, .1),
      entity('sofa', 'sofa', 0, 0, 0, 2, .9),
    ] });
    const proposal = planTvViewing(input, goal);
    expect(proposal.findings).toEqual(expect.arrayContaining([expect.objectContaining({
      ruleId: 'layout.rear-boundary-proximity', code: 'rear-boundary-proximity-improved',
    })]));
    expect(proposal.findings.every((finding) => finding.scoreImpact === undefined)).toBe(true);
  });

  it('returns only Contract v1 proposal fields and scalar finding parameters', () => {
    const proposal = planTvViewing(scene(), goal);
    expect(Object.keys(proposal).sort()).toEqual(['findings', 'moves', 'scoreAfter', 'scoreBefore']);
    for (const finding of proposal.findings) for (const value of Object.values(finding.params ?? {}))
      expect(['string', 'number', 'boolean']).toContain(typeof value);
  });

  it('freezes representative TV proposals before layout extraction', () => {
    const orientation = scene();
    orientation.entities.find((item) => item.role === 'sofa')!.transform.rotationY = Math.PI;
    const circulation = scene({ circulationZones: [{ id: 'path', center: { x: 0, z: -.9 }, bounds: { width: 1.2, depth: 1.2 } }] });
    const alreadyGood = scene({
      room: { width: 6, depth: 4.1 },
      entities: [entity('tv', 'tv', 0, 1, Math.PI, 1.2, .1), entity('sofa', 'sofa', 0, -1.5, 0, 2, .9)],
    });

    const representative = {
      orientation: planTvViewing(orientation, goal),
      circulation: planTvViewingWithLegacyPriorities(circulation, goal, ['circulation', 'viewing', 'conversation']),
      alreadyGood: planTvViewing(alreadyGood, goal),
    };
    expect(representative).toEqual({
      orientation: {
        moves: [
          { instanceId: 'source-sofa', position: { x: 0, z: -2.4499999999999997 }, rotationY: 0 },
          { instanceId: 'source-chair', position: { x: -1.55, z: -1.0999999999999996 }, rotationY: 2.2873380008913005 },
        ],
        scoreBefore: { total: 13.69959803680203 },
        scoreAfter: { total: 79.70278314762797 },
        findings: [
          { ruleId: 'tv-viewing.orientation', code: 'good-orientation', severity: 'positive', objectIds: ['source-sofa'], params: { before: 0.009999999999999953, after: 0.75 } },
          { ruleId: 'layout.rear-boundary-proximity', code: 'rear-boundary-proximity-improved', severity: 'positive', objectIds: ['source-sofa'], params: { before: 0, after: 0.7999999999999998 } },
          { ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive', params: { improvement: 66.00318511082594 } },
        ],
      },
      circulation: {
        moves: [
          { instanceId: 'source-sofa', position: { x: -1.2, z: -2.4499999999999997 }, rotationY: 0 },
          { instanceId: 'source-table', position: { x: -1.2, z: -1.1999999999999997 }, rotationY: 0 },
        ],
        scoreBefore: { total: 62.93971862576143 },
        scoreAfter: { total: 79.37910472535066 },
        findings: [
          { ruleId: 'room.circulation', code: 'circulation-improved', severity: 'positive', params: { before: 0.6666666666666666, after: 1 } },
          { ruleId: 'layout.rear-boundary-proximity', code: 'rear-boundary-proximity-improved', severity: 'positive', objectIds: ['source-sofa'], params: { before: 0.10000000000000053, after: 0.7999999999999998 } },
          { ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive', params: { improvement: 16.43938609958923 } },
        ],
      },
      alreadyGood: {
        moves: [],
        scoreBefore: { total: 96.36363636363636 },
        scoreAfter: { total: 96.36363636363636 },
        findings: [{ ruleId: 'layout.selection', code: 'layout-already-good', severity: 'info', params: { score: 96.36363636363636 } }],
      },
    });
  });

  it('freezes the TV improvement-too-small proposal', () => {
    const input = scene({
      room: { width: 6, depth: 4.1 },
      entities: [entity('tv', 'tv', 0, 1, Math.PI, 1.2, .1), entity('sofa', 'sofa', 0, -1.5, .03, 2, .9)],
    });
    const first = planTvViewing(input, goal);
    const second = planTvViewing(input, goal);

    expect(first).toEqual({
      moves: [],
      scoreBefore: { total: 95.18267386099674 },
      scoreAfter: { total: 95.18267386099674 },
      findings: [{
        ruleId: 'layout.selection',
        code: 'layout-improvement-too-small',
        severity: 'info',
        params: { score: 95.18267386099674 },
      }],
    });
    expect(second).toEqual(first);
  });
});
