import type { PlanProposal, PlanningFinding, PlanningGoal, PlanningPriority } from '../contracts/types';
import { angularDifference, orientedRectsOverlap, pointDistance, rectContainedInRoom, rotatedHalfExtents, xzHeading, type OrientedRect } from '@/editor/spatial/geometry';
import type { PlanningEntity, PlanningScene, PlanningTransform } from './PlanningScene';
import { collisionMasksOverlap } from '@/editor/placement/collisionPolicy';

const SCORE_EPSILON = 1e-9;
const ACCEPTANCE_THRESHOLD = 4;
const DEFAULT_PRIORITIES: PlanningPriority[] = ['viewing', 'circulation', 'conversation'];
const PRIORITY_SLOTS = [45, 30, 15] as const;

type Candidate = PlanningTransform & { key: string };
type Arrangement = Map<string, Candidate>;
type QualityComponent = PlanningPriority | 'rearBoundaryProximity';
type Quality = { total: number; components: Partial<Record<QualityComponent, number>> };
type Evaluation = { arrangement: Arrangement; quality: Quality; utility: number; movedCount: number; translation: number; rotation: number; key: string };

const rectFor = (entity: PlanningEntity, transform: PlanningTransform): OrientedRect => ({
  center: transform.position,
  rotationY: transform.rotationY,
  ...entity.footprint,
});

const sameTransform = (a: PlanningTransform, b: PlanningTransform) =>
  pointDistance(a.position, b.position) <= SCORE_EPSILON && angularDifference(a.rotationY, b.rotationY) <= SCORE_EPSILON;

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
  return Math.max(0, 1 - gapBehind / .5);
};

const activeTransform = (entity: PlanningEntity, arrangement: Arrangement): PlanningTransform =>
  arrangement.get(entity.id) ?? entity.transform;

const roomObjectInstanceId = (entity: PlanningEntity): string => {
  if (entity.source.kind !== 'roomObject') throw new Error(`Entity ${entity.id} does not originate from a room object`);
  return entity.source.instanceId;
};

const quality = (scene: PlanningScene, arrangement: Arrangement, priorities: PlanningPriority[], focal: PlanningEntity): Quality => {
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa');
  const chairs = scene.entities.filter((entity) => entity.role === 'armchair');
  const movable = scene.entities.filter((entity) => !entity.fixed && entity.role !== 'floorLamp');
  const samples: Partial<Record<QualityComponent, number[]>> = {};
  if (sofas.length) {
    samples.viewing = sofas.map((sofa) => {
      const transform = activeTransform(sofa, arrangement);
      const orientation = facing(transform, focal.transform);
      const distance = pointDistance(transform.position, focal.transform.position);
      const distanceScore = Math.max(0, 1 - Math.abs(distance - 2.5) / 2.5);
      return .75 * orientation + .25 * distanceScore;
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
      const distanceScore = Math.max(0, 1 - Math.abs(distance - 1.8) / 1.8);
      return .55 * facing(chairTransform, sofaTransform) + .45 * distanceScore;
    });
  }

  const components: Quality['components'] = {};
  for (const [id, values] of Object.entries(samples) as [QualityComponent, number[]][]) {
    if (values.length) components[id] = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const weights: Partial<Record<QualityComponent, number>> = { rearBoundaryProximity: 10 };
  priorities.forEach((priority, index) => { weights[priority] = PRIORITY_SLOTS[index] ?? 0; });
  const applicable = (Object.keys(components) as QualityComponent[]).filter((id) => (weights[id] ?? 0) > 0);
  const weightTotal = applicable.reduce((sum, id) => sum + weights[id]!, 0);
  const total = weightTotal === 0 ? 100 : applicable.reduce((sum, id) => sum + components[id]! * weights[id]!, 0) / weightTotal * 100;
  return { total, components };
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
  candidates.push({ position: { ...sofa.transform.position }, rotationY: xzHeading(sofa.transform.position, focal.transform.position), key: 'current-facing' });
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
      ? wall.sign * (scene.room.width / 2 - extent.x - .1)
      : wall.sign * (scene.room.depth / 2 - extent.z - .1);
    for (const [index, along] of [-.6, 0, .6].entries()) {
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

const chairCandidates = (chair: PlanningEntity, sofa: PlanningEntity, sofaTransform: PlanningTransform): Candidate[] => {
  const candidates: Candidate[] = [{ ...chair.transform, key: 'current' }];
  const cosine = Math.cos(sofaTransform.rotationY);
  const sine = Math.sin(sofaTransform.rotationY);
  const slots = [[-1.35, .65], [1.35, .65], [-1.55, 1.35], [1.55, 1.35], [-1.25, 2], [1.25, 2]];
  slots.forEach(([lateral, forward], index) => {
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
  for (const gap of [.35, .5, .65]) for (const lateral of [-.25, 0, .25]) {
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

const hardConstraintsPass = (scene: PlanningScene, arrangement: Arrangement): boolean => {
  for (const entity of scene.entities) {
    const transform = activeTransform(entity, arrangement);
    if (entity.fixed && !sameTransform(transform, entity.transform)) return false;
    if (entity.placementType !== 'floor' && entity.role !== 'tv') return false;
    const rect = rectFor(entity, transform);
    if (!rectContainedInRoom(scene.room, rect)) return false;
    if (entity.role !== 'tv' && scene.immediateOpeningZones.some((zone) => orientedRectsOverlap(rect, {
      center: zone.center, rotationY: zone.rotationY ?? 0, ...zone.bounds,
    }))) return false;
  }
  for (let first = 0; first < scene.entities.length; first++) for (let second = first + 1; second < scene.entities.length; second++) {
    const a = scene.entities[first]!;
    const b = scene.entities[second]!;
    if (collisionMasksOverlap(a.collision, b.collision)
      && orientedRectsOverlap(rectFor(a, activeTransform(a, arrangement)), rectFor(b, activeTransform(b, arrangement)))) return false;
  }
  return true;
};

const evaluate = (scene: PlanningScene, arrangement: Arrangement, priorities: PlanningPriority[], focal: PlanningEntity): Evaluation => {
  let movedCount = 0;
  let translation = 0;
  let rotation = 0;
  const keys: string[] = [];
  for (const entity of scene.entities) {
    const candidate = arrangement.get(entity.id);
    if (!candidate) continue;
    keys.push(`${entity.id}:${candidate.key}`);
    if (!sameTransform(candidate, entity.transform)) {
      movedCount++;
      translation += pointDistance(candidate.position, entity.transform.position);
      rotation += angularDifference(candidate.rotationY, entity.transform.rotationY);
    }
  }
  const score = quality(scene, arrangement, priorities, focal);
  const movementCost = Math.min(20, movedCount * 2 + translation * 2 + rotation / (Math.PI / 4));
  return { arrangement: new Map(arrangement), quality: score, utility: score.total - movementCost, movedCount, translation, rotation, key: keys.join('|') };
};

const better = (a: Evaluation, b: Evaluation): boolean => {
  const compare = (left: number, right: number, lower = false) => Math.abs(left - right) > SCORE_EPSILON ? (lower ? left < right : left > right) : undefined;
  return compare(a.utility, b.utility) ?? compare(a.movedCount, b.movedCount, true)
    ?? compare(a.translation, b.translation, true) ?? compare(a.rotation, b.rotation, true) ?? a.key < b.key;
};

type SelectionOutcome = 'improved' | 'already-good' | 'improvement-too-small' | 'no-valid-plan';

const findings = (before: Quality, after: Quality, outcome: SelectionOutcome, sofaIds: string[]): PlanningFinding[] => {
  if (outcome !== 'improved') return [{
    ruleId: 'layout.selection',
    code: `layout-${outcome}`,
    severity: outcome === 'no-valid-plan' ? 'warning' : 'info',
    params: { score: before.total },
  }];
  const result: PlanningFinding[] = [];
  const add = (id: QualityComponent, ruleId: string, code: string, objectIds?: string[]) => {
    const from = before.components[id]; const to = after.components[id];
    if (from !== undefined && to !== undefined && to > from + SCORE_EPSILON) result.push({ ruleId, code, severity: 'positive', objectIds, params: { before: from, after: to } });
  };
  add('viewing', 'tv-viewing.orientation', 'good-orientation', sofaIds);
  add('circulation', 'room.circulation', 'circulation-improved');
  add('rearBoundaryProximity', 'layout.rear-boundary-proximity', 'rear-boundary-proximity-improved', sofaIds);
  result.push({ ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive', params: { improvement: after.total - before.total } });
  return result;
};

export const planTvViewing = (scene: PlanningScene, goal: PlanningGoal): PlanProposal => {
  const requestedPriorities = goal.priorities ?? [];
  const priorities = [...requestedPriorities, ...DEFAULT_PRIORITIES.filter((priority) => !requestedPriorities.includes(priority))];
  const entityIds = new Set(scene.entities.map((entity) => entity.id));
  if (entityIds.size !== scene.entities.length) throw new Error('PlanningScene entity IDs must be unique');
  const focalMatches = scene.entities.filter((entity) => entity.id === goal.focalPointId);
  if (focalMatches.length !== 1 || focalMatches[0]!.role !== 'tv') throw new Error(`Unable to resolve unique TV focal entity: ${goal.focalPointId}`);
  const focal = focalMatches[0]!;
  if (!focal.fixed) throw new Error('TV focal entity must be fixed');
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa' && !entity.fixed).sort((a, b) => a.id.localeCompare(b.id));
  if (sofas.length !== 1) throw new Error('TV planning requires exactly one movable sofa');
  const roleOrder = { sofa: 0, armchair: 1, coffeeTable: 2 } as const;
  const movable = scene.entities.filter((entity): entity is PlanningEntity & { role: keyof typeof roleOrder } =>
    !entity.fixed && entity.role in roleOrder).sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.id.localeCompare(b.id));
  for (const entity of movable) {
    if (entity.placementType !== 'floor') throw new Error(`Unsupported placement type for movable entity ${entity.id}: ${entity.placementType}`);
    if (entity.source.kind !== 'roomObject') throw new Error(`Movable entity ${entity.id} must originate from a room object`);
  }
  const current = new Map<string, Candidate>(movable.map((entity) => [entity.id, { ...entity.transform, key: 'current' }]));
  if (!hardConstraintsPass(scene, current)) throw new Error('Current PlanningScene arrangement violates hard constraints');
  const currentEvaluation = evaluate(scene, current, priorities, focal);
  let best: Evaluation | undefined;
  let bestAlternative: Evaluation | undefined;
  const visit = (index: number, arrangement: Arrangement) => {
    if (index === movable.length) {
      if (!hardConstraintsPass(scene, arrangement)) return;
      const evaluated = evaluate(scene, arrangement, priorities, focal);
      if (!best || better(evaluated, best)) best = evaluated;
      if (evaluated.movedCount > 0 && (!bestAlternative || better(evaluated, bestAlternative))) bestAlternative = evaluated;
      return;
    }
    const entity = movable[index]!;
    const sofa = sofas[0]!;
    const sofaTransform = entity.role === 'sofa' ? undefined : activeTransform(sofa, arrangement);
    const candidates = entity.role === 'sofa' ? sofaCandidates(scene, entity, focal)
      : entity.role === 'armchair' ? chairCandidates(entity, sofa, sofaTransform!)
      : tableCandidates(entity, sofa, sofaTransform!);
    for (const candidate of candidates) {
      arrangement.set(entity.id, candidate);
      visit(index + 1, arrangement);
    }
    arrangement.delete(entity.id);
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
  const moves = movable.flatMap((entity) => {
    const transform = selected.arrangement.get(entity.id) ?? entity.transform;
    return sameTransform(transform, entity.transform) ? [] : [{ instanceId: roomObjectInstanceId(entity), position: { ...transform.position }, rotationY: transform.rotationY }];
  });
  return {
    moves,
    scoreBefore: { total: currentEvaluation.quality.total },
    scoreAfter: { total: selected.quality.total },
    findings: findings(currentEvaluation.quality, selected.quality, outcome, sofas.map(roomObjectInstanceId)),
  };
};
