import type { PlanningFinding, PlanProposal } from '@/editor/planning/contracts/types';
import {
  activeTransform,
  runLivingRoomLayout,
  roomObjectInstanceId,
  type Arrangement,
  type Candidate,
  type CandidateDimension,
  type LayoutQuality,
  type PlanningEntity,
  type PlanningScene,
  type PlanningTransform,
  type RuleEvaluation,
  type SelectionOutcome,
} from '@/editor/planning/livingRoom';
import { angularDifference, pointDistance, rotatedHalfExtents, xzHeading } from '@/editor/spatial/geometry';
import { CONVERSATION_LAYOUT_HEURISTICS, CONVERSATION_SELECTION_POLICY } from './constants';
import { validateConversationApplicability } from './applicability';

const SCORE_EPSILON = 1e-9;
const compareLexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const facing = (from: PlanningTransform, target: PlanningTransform): number =>
  Math.max(0, 1 - angularDifference(from.rotationY, xzHeading(from.position, target.position)) / (Math.PI / 2));

const rearBoundaryProximity = (scene: PlanningScene, entity: PlanningEntity, transform: PlanningTransform): number => {
  const backward = { x: -Math.sin(transform.rotationY), z: -Math.cos(transform.rotationY) };
  const backEdge = {
    x: transform.position.x + backward.x * entity.footprint.depth / 2,
    z: transform.position.z + backward.z * entity.footprint.depth / 2,
  };
  const distances: number[] = [];
  if (Math.abs(backward.x) > SCORE_EPSILON) distances.push((Math.sign(backward.x) * scene.room.width / 2 - backEdge.x) / backward.x);
  if (Math.abs(backward.z) > SCORE_EPSILON) distances.push((Math.sign(backward.z) * scene.room.depth / 2 - backEdge.z) / backward.z);
  const gapBehind = Math.min(...distances.filter((distance) => distance >= 0));
  return Math.max(0, 1 - gapBehind / CONVERSATION_LAYOUT_HEURISTICS.rearBoundary.referenceGap);
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

const sofaCandidates = (scene: PlanningScene, sofa: PlanningEntity, chairs: readonly PlanningEntity[]): Candidate[] => {
  const cluster = chairs.reduce((center, chair) => ({
    x: center.x + chair.transform.position.x / chairs.length,
    z: center.z + chair.transform.position.z / chairs.length,
  }), { x: 0, z: 0 });
  const candidates: Candidate[] = [
    { ...sofa.transform, key: 'current' },
    { ...sofa.transform, rotationY: xzHeading(sofa.transform.position, cluster), key: 'current-facing-group' },
  ];
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
      ? wall.sign * (scene.room.width / 2 - extent.x - CONVERSATION_LAYOUT_HEURISTICS.sofa.wallClearance)
      : wall.sign * (scene.room.depth / 2 - extent.z - CONVERSATION_LAYOUT_HEURISTICS.sofa.wallClearance);
    for (const [index, along] of CONVERSATION_LAYOUT_HEURISTICS.sofa.wallAlongFactors.entries()) {
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

const armchairCandidates = (chair: PlanningEntity, sofaTransform: PlanningTransform): Candidate[] => {
  const cosine = Math.cos(sofaTransform.rotationY);
  const sine = Math.sin(sofaTransform.rotationY);
  const candidates: Candidate[] = [{ ...chair.transform, key: 'current' }];
  CONVERSATION_LAYOUT_HEURISTICS.armchair.slots.forEach(([lateral, forward], index) => {
    const position = {
      x: sofaTransform.position.x + lateral! * cosine + forward! * sine,
      z: sofaTransform.position.z - lateral! * sine + forward! * cosine,
    };
    candidates.push({ position, rotationY: xzHeading(position, sofaTransform.position), key: `conversation-${index}` });
  });
  return uniqueCandidates(candidates);
};

const conversationRuleEvaluations = (
  scene: PlanningScene,
  arrangement: Arrangement,
  sofa: PlanningEntity,
  armchairs: readonly PlanningEntity[],
): RuleEvaluation[] => {
  const sofaTransform = activeTransform(sofa, arrangement);
  const facingQuality = armchairs.reduce((sum, chair) => sum + facing(activeTransform(chair, arrangement), sofaTransform), 0) / armchairs.length;
  const distanceQuality = armchairs.reduce((sum, chair) => {
    const distance = pointDistance(activeTransform(chair, arrangement).position, sofaTransform.position);
    return sum + Math.max(0, 1 - Math.abs(distance - CONVERSATION_LAYOUT_HEURISTICS.distance.ideal) / CONVERSATION_LAYOUT_HEURISTICS.distance.ideal);
  }, 0) / armchairs.length;
  return [
    { id: 'conversation.facing', quality: facingQuality },
    { id: 'conversation.distance', quality: distanceQuality },
    { id: 'conversation.rearBoundary', quality: rearBoundaryProximity(scene, sofa, sofaTransform) },
  ];
};

const findings = (before: LayoutQuality, after: LayoutQuality, outcome: SelectionOutcome, objectIds: string[]): PlanningFinding[] => {
  if (outcome !== 'improved') return [{
    ruleId: 'layout.selection',
    code: `layout-${outcome}`,
    severity: outcome === 'no-valid-plan' ? 'warning' : 'info',
    params: { score: before.total },
  }];
  const result: PlanningFinding[] = [];
  const add = (id: string, ruleId: string, code: string) => {
    const from = before.components[id]; const to = after.components[id];
    if (from !== undefined && to !== undefined && to > from + SCORE_EPSILON) {
      result.push({ ruleId, code, severity: 'positive', objectIds, params: { before: from, after: to } });
    }
  };
  add('conversation.facing', 'conversation.facing', 'conversation-facing-improved');
  add('conversation.distance', 'conversation.distance', 'conversation-distance-improved');
  add('conversation.rearBoundary', 'conversation.rear-boundary', 'conversation-rear-boundary-improved');
  result.push({ ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive', params: { improvement: after.total - before.total } });
  return result;
};

/** Plans a narrow, deterministic sofa-and-armchairs conversation arrangement. */
export const planConversation = (scene: PlanningScene): PlanProposal => {
  const { sofa, armchairs } = validateConversationApplicability(scene);
  const movable = [sofa, ...armchairs].sort((a, b) => (a.role === 'sofa' ? -1 : 1) - (b.role === 'sofa' ? -1 : 1) || compareLexical(a.id, b.id));
  const fixedContext = scene.entities.filter((entity) => !movable.some((active) => active.id === entity.id));
  const dimensions: CandidateDimension[] = movable.map((entity) => ({
    entity,
    provide: (arrangement) => entity.id === sofa.id
      ? sofaCandidates(scene, sofa, armchairs)
      : armchairCandidates(entity, activeTransform(sofa, arrangement)),
  }));
  const result = runLivingRoomLayout({
    scene,
    activeGroup: { participants: movable, movable, fixedContext },
    selectionPolicy: CONVERSATION_SELECTION_POLICY,
    dimensions,
    evaluateRules: (arrangement) => conversationRuleEvaluations(scene, arrangement, sofa, armchairs),
    ruleWeights: [
      { id: 'conversation.facing', weight: CONVERSATION_LAYOUT_HEURISTICS.weights.facing },
      { id: 'conversation.distance', weight: CONVERSATION_LAYOUT_HEURISTICS.weights.distance },
      { id: 'conversation.rearBoundary', weight: CONVERSATION_LAYOUT_HEURISTICS.weights.rearBoundary },
    ],
    buildFindings: (before, after, outcome) => findings(before, after, outcome, [sofa, ...armchairs].map(roomObjectInstanceId)),
  });
  return result.proposal;
};
