import type { PlanProposal, PlanningFinding } from '../contracts/types';
import { angularDifference, orientedRectsOverlap, pointDistance, rectContainedInRoom, type OrientedRect } from '@/editor/spatial/geometry';
import { collisionMasksOverlap } from '@/editor/placement/collisionPolicy';
import type { PlanningEntity, PlanningScene, PlanningTransform } from './PlanningScene';

const SCORE_EPSILON = 1e-9;
export const ACCEPTANCE_THRESHOLD = 4;

export type Candidate = PlanningTransform & { key: string };
export type Arrangement = Map<string, Candidate>;

export type ActiveGroup = {
  participants: readonly PlanningEntity[];
  movable: readonly PlanningEntity[];
  fixedContext: readonly PlanningEntity[];
};

export type CandidateDimension = {
  entity: PlanningEntity;
  provide: (arrangement: Arrangement) => readonly Candidate[];
};

export type RuleEvaluation = {
  id: string;
  quality: number;
};

export type LayoutQuality = {
  total: number;
  components: Partial<Record<string, number>>;
};

export type SelectionOutcome = 'improved' | 'already-good' | 'improvement-too-small' | 'no-valid-plan';

export type LayoutEvaluation = {
  arrangement: Arrangement;
  quality: LayoutQuality;
  utility: number;
  movedCount: number;
  translation: number;
  rotation: number;
  key: string;
};

export type LayoutSelection = LayoutEvaluation & { outcome: SelectionOutcome };

export type LayoutDiagnostics = {
  roomEntityCount: number;
  activeMovableCount: number;
  candidateDimensionCount: number;
  arrangementsEvaluated: number;
  branchesPruned: number;
  maxCandidateCountByEntity: Record<string, number>;
};

export type LayoutPlanRequest = {
  scene: PlanningScene;
  activeGroup: ActiveGroup;
  dimensions: readonly CandidateDimension[];
  evaluateRules: (arrangement: Arrangement) => readonly (RuleEvaluation | null)[];
  ruleWeights: readonly { id: string; weight: number }[];
  buildFindings: (before: LayoutQuality, after: LayoutQuality, outcome: SelectionOutcome) => PlanningFinding[];
  openingZoneExempt?: (entity: PlanningEntity) => boolean;
};

export type LayoutPlanResult = {
  proposal: PlanProposal;
  selection: LayoutSelection;
  diagnostics: LayoutDiagnostics;
};

const rectFor = (entity: PlanningEntity, transform: PlanningTransform): OrientedRect => ({
  center: transform.position,
  rotationY: transform.rotationY,
  ...entity.footprint,
});

const sameTransform = (a: PlanningTransform, b: PlanningTransform) =>
  pointDistance(a.position, b.position) <= SCORE_EPSILON && angularDifference(a.rotationY, b.rotationY) <= SCORE_EPSILON;

export const activeTransform = (entity: PlanningEntity, arrangement: Arrangement): PlanningTransform =>
  arrangement.get(entity.id) ?? entity.transform;

const validateActiveGroup = (scene: PlanningScene, activeGroup: ActiveGroup): void => {
  const sceneIds = new Set(scene.entities.map((entity) => entity.id));
  if (sceneIds.size !== scene.entities.length) throw new Error('PlanningScene entity IDs must be unique');
  const movableIds = new Set(activeGroup.movable.map((entity) => entity.id));
  const contextIds = new Set(activeGroup.fixedContext.map((entity) => entity.id));
  if (movableIds.size !== activeGroup.movable.length || contextIds.size !== activeGroup.fixedContext.length) {
    throw new Error('ActiveGroup entity IDs must be unique');
  }
  if (activeGroup.movable.some((entity) => !sceneIds.has(entity.id))
    || activeGroup.fixedContext.some((entity) => !sceneIds.has(entity.id))) {
    throw new Error('ActiveGroup entities must belong to the PlanningScene');
  }
  if (activeGroup.movable.some((entity) => contextIds.has(entity.id))) {
    throw new Error('ActiveGroup movable entities cannot be fixed context');
  }
  if (scene.entities.some((entity) => !movableIds.has(entity.id) && !contextIds.has(entity.id))) {
    throw new Error('ActiveGroup fixed context must cover every non-movable scene entity');
  }
  if (activeGroup.movable.some((entity) => !activeGroup.participants.some((participant) => participant.id === entity.id))) {
    throw new Error('ActiveGroup movable entities must be participants');
  }
};

const finiteTransform = (transform: PlanningTransform): boolean =>
  Number.isFinite(transform.position.x) && Number.isFinite(transform.position.z) && Number.isFinite(transform.rotationY);

const placementPass = (
  scene: PlanningScene,
  entity: PlanningEntity,
  transform: PlanningTransform,
  openingZoneExempt?: (entity: PlanningEntity) => boolean,
): boolean => {
  if (!finiteTransform(transform)) return false;
  if (!rectContainedInRoom(scene.room, rectFor(entity, transform))) return false;
  if (!openingZoneExempt?.(entity) && scene.immediateOpeningZones.some((zone) => orientedRectsOverlap(rectFor(entity, transform), {
    center: zone.center, rotationY: zone.rotationY ?? 0, ...zone.bounds,
  }))) return false;
  return true;
};

const collisionPass = (a: PlanningEntity, aTransform: PlanningTransform, b: PlanningEntity, bTransform: PlanningTransform): boolean =>
  !collisionMasksOverlap(a.collision, b.collision)
  || !orientedRectsOverlap(rectFor(a, aTransform), rectFor(b, bTransform));

const hardConstraintsPass = (
  request: LayoutPlanRequest,
  arrangement: Arrangement,
  complete: boolean,
): boolean => {
  const { scene, activeGroup } = request;
  const movableIds = new Set(activeGroup.movable.map((entity) => entity.id));
  if ([...arrangement.keys()].some((id) => !movableIds.has(id))) return false;

  const assigned = activeGroup.movable.filter((entity) => arrangement.has(entity.id));
  if (complete) {
    if (assigned.length !== activeGroup.movable.length) return false;
    for (const entity of scene.entities) {
      if (!placementPass(scene, entity, activeTransform(entity, arrangement), request.openingZoneExempt)) return false;
    }
    for (let first = 0; first < scene.entities.length; first += 1) {
      for (let second = first + 1; second < scene.entities.length; second += 1) {
        const a = scene.entities[first]!;
        const b = scene.entities[second]!;
        if (!collisionPass(a, activeTransform(a, arrangement), b, activeTransform(b, arrangement))) return false;
      }
    }
    return true;
  }

  for (const entity of assigned) {
    if (!placementPass(scene, entity, activeTransform(entity, arrangement), request.openingZoneExempt)) return false;
    for (const context of activeGroup.fixedContext) {
      if (!collisionPass(entity, activeTransform(entity, arrangement), context, context.transform)) return false;
    }
  }
  for (let first = 0; first < assigned.length; first += 1) {
    for (let second = first + 1; second < assigned.length; second += 1) {
      const a = assigned[first]!;
      const b = assigned[second]!;
      if (!collisionPass(a, activeTransform(a, arrangement), b, activeTransform(b, arrangement))) return false;
    }
  }
  return true;
};

const aggregateQuality = (
  evaluations: readonly (RuleEvaluation | null)[],
  ruleWeights: readonly { id: string; weight: number }[],
): LayoutQuality => {
  const components: Partial<Record<string, number>> = {};
  for (const evaluation of evaluations) {
    if (evaluation) components[evaluation.id] = evaluation.quality;
  }
  const weights = new Map<string, number>();
  for (const rule of ruleWeights) weights.set(rule.id, rule.weight);
  const applicable = (Object.keys(components)).filter((id) => (weights.get(id) ?? 0) > 0);
  const weightTotal = applicable.reduce((sum, id) => sum + weights.get(id)!, 0);
  const total = weightTotal === 0
    ? 100
    : applicable.reduce((sum, id) => sum + components[id]! * weights.get(id)!, 0) / weightTotal * 100;
  return { total, components };
};

const evaluate = (request: LayoutPlanRequest, arrangement: Arrangement): LayoutEvaluation => {
  let movedCount = 0;
  let translation = 0;
  let rotation = 0;
  const keys: string[] = [];
  for (const entity of request.scene.entities) {
    const candidate = arrangement.get(entity.id);
    if (!candidate) continue;
    keys.push(`${entity.id}:${candidate.key}`);
    if (!sameTransform(candidate, entity.transform)) {
      movedCount += 1;
      translation += pointDistance(candidate.position, entity.transform.position);
      rotation += angularDifference(candidate.rotationY, entity.transform.rotationY);
    }
  }
  const quality = aggregateQuality(request.evaluateRules(arrangement), request.ruleWeights);
  const movementCost = Math.min(20, movedCount * 2 + translation * 2 + rotation / (Math.PI / 4));
  return {
    arrangement: new Map(arrangement),
    quality,
    utility: quality.total - movementCost,
    movedCount,
    translation,
    rotation,
    key: keys.join('|'),
  };
};

const better = (a: LayoutEvaluation, b: LayoutEvaluation): boolean => {
  const compare = (left: number, right: number, lower = false) =>
    Math.abs(left - right) > SCORE_EPSILON ? (lower ? left < right : left > right) : undefined;
  return compare(a.utility, b.utility) ?? compare(a.movedCount, b.movedCount, true)
    ?? compare(a.translation, b.translation, true) ?? compare(a.rotation, b.rotation, true) ?? a.key < b.key;
};

export const roomObjectInstanceId = (entity: PlanningEntity): string => {
  if (entity.source.kind !== 'roomObject') throw new Error(`Entity ${entity.id} does not originate from a room object`);
  return entity.source.instanceId;
};

export const runLivingRoomLayout = (request: LayoutPlanRequest): LayoutPlanResult => {
  validateActiveGroup(request.scene, request.activeGroup);
  const dimensionIds = new Set(request.dimensions.map((dimension) => dimension.entity.id));
  if (dimensionIds.size !== request.dimensions.length
    || dimensionIds.size !== request.activeGroup.movable.length
    || request.activeGroup.movable.some((entity) => !dimensionIds.has(entity.id))) {
    throw new Error('Candidate dimensions must cover the active movable group exactly once');
  }

  const diagnostics: LayoutDiagnostics = {
    roomEntityCount: request.scene.entities.length,
    activeMovableCount: request.activeGroup.movable.length,
    candidateDimensionCount: request.dimensions.length,
    arrangementsEvaluated: 0,
    branchesPruned: 0,
    maxCandidateCountByEntity: {},
  };
  const current = new Map<string, Candidate>(request.activeGroup.movable.map((entity) => [entity.id, { ...entity.transform, key: 'current' }]));
  if (!hardConstraintsPass(request, current, true)) {
    throw new Error('Current PlanningScene arrangement violates hard constraints');
  }
  const currentEvaluation = evaluate(request, current);
  let best: LayoutEvaluation | undefined;
  let bestAlternative: LayoutEvaluation | undefined;

  const visit = (index: number, arrangement: Arrangement): void => {
    if (index === request.dimensions.length) {
      if (!hardConstraintsPass(request, arrangement, true)) {
        diagnostics.branchesPruned += 1;
        return;
      }
      diagnostics.arrangementsEvaluated += 1;
      const evaluated = evaluate(request, arrangement);
      if (!best || better(evaluated, best)) best = evaluated;
      if (evaluated.movedCount > 0 && (!bestAlternative || better(evaluated, bestAlternative))) bestAlternative = evaluated;
      return;
    }
    const dimension = request.dimensions[index]!;
    const candidates = dimension.provide(arrangement);
    diagnostics.maxCandidateCountByEntity[dimension.entity.id] = Math.max(
      diagnostics.maxCandidateCountByEntity[dimension.entity.id] ?? 0,
      candidates.length,
    );
    for (const candidate of candidates) {
      arrangement.set(dimension.entity.id, candidate);
      if (hardConstraintsPass(request, arrangement, false)) visit(index + 1, arrangement);
      else diagnostics.branchesPruned += 1;
    }
    arrangement.delete(dimension.entity.id);
  };

  visit(0, new Map());
  const accepted = best !== undefined && best.movedCount > 0
    && best.utility - currentEvaluation.utility >= ACCEPTANCE_THRESHOLD - SCORE_EPSILON;
  const selected = accepted ? best! : currentEvaluation;
  const outcome: SelectionOutcome = accepted ? 'improved'
    : !best ? 'no-valid-plan'
    : bestAlternative && bestAlternative.quality.total > currentEvaluation.quality.total + SCORE_EPSILON
      ? 'improvement-too-small'
      : 'already-good';
  const selection: LayoutSelection = { ...selected, outcome };
  const moves = request.activeGroup.movable.flatMap((entity) => {
    const transform = selected.arrangement.get(entity.id) ?? entity.transform;
    return sameTransform(transform, entity.transform) ? [] : [{
      instanceId: roomObjectInstanceId(entity),
      position: { ...transform.position },
      rotationY: transform.rotationY,
    }];
  });
  return {
    selection,
    diagnostics,
    proposal: {
      moves,
      scoreBefore: { total: currentEvaluation.quality.total },
      scoreAfter: { total: selected.quality.total },
      findings: request.buildFindings(currentEvaluation.quality, selected.quality, outcome),
    },
  };
};
