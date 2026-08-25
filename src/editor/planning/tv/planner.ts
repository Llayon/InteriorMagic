import type {
  PlanningFinding,
  PlanningPriorityV1,
  PlanProposal,
  WatchTvGoalV2,
} from '../contracts/types';
import {
  angularDifference,
  orientedRectsOverlap,
  pointDistance,
  rotatedHalfExtents,
  xzHeading,
  type OrientedRect,
} from '@/editor/spatial/geometry';
import {
  activeTransform,
  roomObjectInstanceId,
  runLivingRoomLayout,
  type Arrangement,
  type Candidate,
  type CandidateDimension,
  type LayoutQuality,
  type RuleEvaluation,
  type SelectionOutcome,
} from '@/editor/planning/livingRoom';
import { PlanningError } from '@/editor/planning/livingRoom';
import type { PlanningEntity, PlanningScene, PlanningTransform } from '@/editor/planning/livingRoom';
import { TV_DEFAULT_PRIORITIES, TV_LAYOUT_HEURISTICS, TV_SELECTION_POLICY } from './constants';
import { validateTvApplicability } from './applicability';

const SCORE_EPSILON = 1e-9;
const compareLexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const rectFor = (entity: PlanningEntity, transform: PlanningTransform): OrientedRect => ({
  center: transform.position,
  rotationY: transform.rotationY,
  ...entity.footprint,
});

const facing = (from: PlanningTransform, target: PlanningTransform) =>
  Math.max(0, 1 - angularDifference(from.rotationY, xzHeading(from.position, target.position)) / (Math.PI / 2));

const rearBoundaryProximity = (scene: PlanningScene, entity: PlanningEntity, transform: PlanningTransform) => {
  const backward = { x: -Math.sin(transform.rotationY), z: -Math.cos(transform.rotationY) };
  const backEdge = {
    x: transform.position.x + backward.x * entity.footprint.depth / 2,
    z: transform.position.z + backward.z * entity.footprint.depth / 2,
  };
  const distances: number[] = [];
  if (Math.abs(backward.x) > SCORE_EPSILON) {
    const wallX = Math.sign(backward.x) * scene.room.width / 2;
    distances.push((wallX - backEdge.x) / backward.x);
  }
  if (Math.abs(backward.z) > SCORE_EPSILON) {
    const wallZ = Math.sign(backward.z) * scene.room.depth / 2;
    distances.push((wallZ - backEdge.z) / backward.z);
  }
  const gapBehind = Math.min(...distances.filter((distance) => distance >= 0));
  return Math.max(0, 1 - gapBehind / TV_LAYOUT_HEURISTICS.rearBoundary.referenceGap);
};

const uniqueCandidates = (candidates: Candidate[]): Candidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const identity = `${candidate.position.x.toFixed(9)}:${candidate.position.z.toFixed(9)}:${candidate.rotationY.toFixed(9)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const sofaCandidates = (scene: PlanningScene, sofa: PlanningEntity, focal: PlanningEntity): Candidate[] => {
  const candidates: Candidate[] = [{ ...sofa.transform, key: 'current' }];
  candidates.push({ ...sofa.transform, rotationY: xzHeading(sofa.transform.position, focal.transform.position), key: 'current-facing' });
  const walls = [
    { id: 'left', axis: 'x' as const, sign: -1, heading: Math.PI / 2 },
    { id: 'right', axis: 'x' as const, sign: 1, heading: -Math.PI / 2 },
    { id: 'back', axis: 'z' as const, sign: -1, heading: 0 },
    { id: 'front', axis: 'z' as const, sign: 1, heading: Math.PI },
  ];
  for (const wall of walls) {
    const extent = rotatedHalfExtents(sofa.footprint, wall.heading);
    const alongLimit = wall.axis === 'x' ? scene.room.depth / 2 - extent.z : scene.room.width / 2 - extent.x;
    const normal = wall.axis === 'x'
      ? wall.sign * (scene.room.width / 2 - extent.x - TV_LAYOUT_HEURISTICS.sofa.wallClearance)
      : wall.sign * (scene.room.depth / 2 - extent.z - TV_LAYOUT_HEURISTICS.sofa.wallClearance);
    for (const [index, along] of TV_LAYOUT_HEURISTICS.sofa.wallAlongFactors.entries()) {
      const value = along * alongLimit;
      candidates.push({
        position: wall.axis === 'x' ? { x: normal, z: value } : { x: value, z: normal },
        rotationY: wall.heading,
        key: `wall-${wall.id}-${index}`,
      });
    }
  }
  return uniqueCandidates(candidates);
};

const chairCandidates = (chair: PlanningEntity, sofaTransform: PlanningTransform): Candidate[] => {
  const candidates: Candidate[] = [{ ...chair.transform, key: 'current' }];
  const cosine = Math.cos(sofaTransform.rotationY);
  const sine = Math.sin(sofaTransform.rotationY);
  TV_LAYOUT_HEURISTICS.armchair.slots.forEach(([lateral, forward], index) => {
    const position = {
      x: sofaTransform.position.x + lateral! * cosine + forward! * sine,
      z: sofaTransform.position.z - lateral! * sine + forward! * cosine,
    };
    candidates.push({ position, rotationY: xzHeading(position, sofaTransform.position), key: `conversation-${index}` });
  });
  return uniqueCandidates(candidates);
};

const tableCandidates = (table: PlanningEntity, sofa: PlanningEntity, sofaTransform: PlanningTransform): Candidate[] => {
  const candidates: Candidate[] = [{ ...table.transform, key: 'current' }];
  const cosine = Math.cos(sofaTransform.rotationY);
  const sine = Math.sin(sofaTransform.rotationY);
  const sofaHalfDepth = sofa.footprint.depth / 2;
  const tableHalfDepth = table.footprint.depth / 2;
  for (const gap of TV_LAYOUT_HEURISTICS.coffeeTable.gaps) for (const lateral of TV_LAYOUT_HEURISTICS.coffeeTable.lateralOffsets) {
    const forward = sofaHalfDepth + tableHalfDepth + gap;
    candidates.push({
      position: {
        x: sofaTransform.position.x + lateral * cosine + forward * sine,
        z: sofaTransform.position.z - lateral * sine + forward * cosine,
      },
      rotationY: sofaTransform.rotationY,
      key: `table-${gap.toFixed(2)}-${lateral.toFixed(2)}`,
    });
  }
  return uniqueCandidates(candidates);
};

const tvRuleEvaluations = (scene: PlanningScene, arrangement: Arrangement, focal: PlanningEntity): RuleEvaluation[] => {
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa');
  const chairs = scene.entities.filter((entity) => entity.role === 'armchair');
  const movable = scene.entities.filter((entity) => entity.role !== 'floorLamp'
    && entity.source.kind === 'roomObject'
    && ['sofa', 'armchair', 'coffeeTable'].includes(entity.role));
  const samples: Partial<Record<string, number[]>> = {};
  if (sofas.length) {
    samples.viewing = sofas.map((sofa) => {
      const transform = activeTransform(sofa, arrangement);
      const orientation = facing(transform, focal.transform);
      const distance = pointDistance(transform.position, focal.transform.position);
      const distanceScore = Math.max(0, 1 - Math.abs(distance - TV_LAYOUT_HEURISTICS.viewing.idealDistance) / TV_LAYOUT_HEURISTICS.viewing.idealDistance);
      return TV_LAYOUT_HEURISTICS.viewing.orientationWeight * orientation
        + TV_LAYOUT_HEURISTICS.viewing.distanceWeight * distanceScore;
    });
    samples.rearBoundaryProximity = sofas.map((sofa) => rearBoundaryProximity(scene, sofa, activeTransform(sofa, arrangement)));
  }
  if (scene.circulationZones.length && movable.length) {
    samples.circulation = movable.flatMap((entity) => scene.circulationZones.map((zone) =>
      orientedRectsOverlap(rectFor(entity, activeTransform(entity, arrangement)), {
        center: zone.center, rotationY: zone.rotationY ?? 0, ...zone.bounds,
      }) ? 0 : 1));
  }
  if (sofas.length && chairs.length) {
    const sofa = sofas[0]!;
    const sofaTransform = activeTransform(sofa, arrangement);
    samples.conversation = chairs.map((chair) => {
      const chairTransform = activeTransform(chair, arrangement);
      const distance = pointDistance(chairTransform.position, sofaTransform.position);
      const distanceScore = Math.max(0, 1 - Math.abs(distance - TV_LAYOUT_HEURISTICS.conversation.idealDistance) / TV_LAYOUT_HEURISTICS.conversation.idealDistance);
      return TV_LAYOUT_HEURISTICS.conversation.facingWeight * facing(chairTransform, sofaTransform)
        + TV_LAYOUT_HEURISTICS.conversation.distanceWeight * distanceScore;
    });
  }
  return (Object.entries(samples) as [string, number[]][]).flatMap(([id, values]) => values.length
    ? [{ id, quality: values.reduce((sum, value) => sum + value, 0) / values.length }]
    : []);
};

const findings = (before: LayoutQuality, after: LayoutQuality, outcome: SelectionOutcome, sofaIds: string[]): PlanningFinding[] => {
  if (outcome !== 'improved') return [{
    ruleId: 'layout.selection',
    code: `layout-${outcome}`,
    severity: outcome === 'no-valid-plan' || outcome === 'search-incomplete' ? 'warning' : 'info',
    params: { score: before.total },
  }];
  const result: PlanningFinding[] = [];
  const add = (id: string, ruleId: string, code: string, objectIds?: string[]) => {
    const from = before.components[id]; const to = after.components[id];
    if (from !== undefined && to !== undefined && to > from + SCORE_EPSILON) {
      result.push({ ruleId, code, severity: 'positive', objectIds, params: { before: from, after: to } });
    }
  };
  add('viewing', 'tv-viewing.orientation', 'good-orientation', sofaIds);
  add('circulation', 'room.circulation', 'circulation-improved');
  add('rearBoundaryProximity', 'layout.rear-boundary-proximity', 'rear-boundary-proximity-improved', sofaIds);
  result.push({ ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive', params: { improvement: after.total - before.total } });
  return result;
};

/** Legacy-only compatibility entry. Do not export from the TV public barrel. */
export const planTvViewingWithLegacyPriorities = (
  scene: PlanningScene,
  goal: WatchTvGoalV2,
  legacyPriorityOrder: readonly PlanningPriorityV1[] = [],
): PlanProposal => {
  const requestedPriorities = legacyPriorityOrder;
  const priorities = [...requestedPriorities, ...TV_DEFAULT_PRIORITIES.filter((priority) => !requestedPriorities.includes(priority))];
  const focalMatches = scene.entities.filter((entity) => entity.id === goal.focalPointId);
  if (focalMatches.length !== 1 || focalMatches[0]!.role !== 'tv') {
    throw new PlanningError('FOCAL_NOT_FOUND', `Unable to resolve unique TV focal entity: ${goal.focalPointId}`);
  }
  const focal = focalMatches[0]!;
  validateTvApplicability(scene);
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa').sort((a, b) => compareLexical(a.id, b.id));
  const roleOrder = { sofa: 0, armchair: 1, coffeeTable: 2 } as const;
  const movable = scene.entities.filter((entity): entity is PlanningEntity & { role: keyof typeof roleOrder } =>
    entity.role in roleOrder).sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || compareLexical(a.id, b.id));
  const fixedContext = scene.entities.filter((entity) => !movable.some((active) => active.id === entity.id));
  const dimensions: CandidateDimension[] = movable.map((entity) => ({
    entity,
    provide: (arrangement) => {
      const sofa = sofas[0]!;
      if (entity.role === 'sofa') return sofaCandidates(scene, entity, focal);
      const sofaTransform = activeTransform(sofa, arrangement);
      return entity.role === 'armchair' ? chairCandidates(entity, sofaTransform) : tableCandidates(entity, sofa, sofaTransform);
    },
  }));
  const result = runLivingRoomLayout({
    scene,
    activeGroup: { participants: [focal, ...movable], movable, fixedContext },
    selectionPolicy: TV_SELECTION_POLICY,
    dimensions,
    evaluateRules: (arrangement) => tvRuleEvaluations(scene, arrangement, focal),
    ruleWeights: [...priorities.map((priority, index) => ({ id: priority, weight: TV_LAYOUT_HEURISTICS.prioritySlots[index] ?? 0 })), { id: 'rearBoundaryProximity', weight: TV_LAYOUT_HEURISTICS.rearBoundaryRuleWeight }],
    buildFindings: (before, after, outcome) => findings(before, after, outcome, sofas.map(roomObjectInstanceId)),
    openingZoneExempt: (entity) => entity.role === 'tv',
  });
  return result.proposal;
};

export const planTvViewing = (scene: PlanningScene, goal: WatchTvGoalV2): PlanProposal =>
  planTvViewingWithLegacyPriorities(scene, goal);
