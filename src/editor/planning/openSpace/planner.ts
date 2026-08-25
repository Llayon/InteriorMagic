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
import {
  clusterCentroid,
  edgeBias,
  floorOpenArea,
  pathWidth,
  rotatedHalfExtents,
  xzHeading,
  type OrientedRect,
} from '@/editor/spatial/geometry';
import { OPEN_SPACE_LAYOUT_HEURISTICS, OPEN_SPACE_SELECTION_POLICY } from './constants';
import { validateOpenSpaceApplicability } from './applicability';

const EPSILON = 1e-9;
const rectFor = (entity: PlanningEntity, transform: PlanningTransform): OrientedRect => ({ ...entity.footprint, center: transform.position, rotationY: transform.rotationY });
const transformFor = (entity: PlanningEntity, arrangement: Arrangement): PlanningTransform => activeTransform(entity, arrangement);

const movableRects = (movable: readonly PlanningEntity[], arrangement: Arrangement): OrientedRect[] =>
  movable.map((entity) => rectFor(entity, transformFor(entity, arrangement)));

const largestRegionQuality = (scene: PlanningScene, rects: readonly OrientedRect[]): number => {
  // A deterministic, conservative free-region proxy: the largest axis-aligned
  // span between occupied AABB edges. It is intentionally cheap for mobile.
  const xs = [-scene.room.width / 2, scene.room.width / 2, ...rects.flatMap((rect) => {
    const half = rotatedHalfExtents(rect, rect.rotationY); return [rect.center.x - half.x, rect.center.x + half.x];
  })].sort((a, b) => a - b);
  const zs = [-scene.room.depth / 2, scene.room.depth / 2, ...rects.flatMap((rect) => {
    const half = rotatedHalfExtents(rect, rect.rotationY); return [rect.center.z - half.z, rect.center.z + half.z];
  })].sort((a, b) => a - b);
  let largest = 0;
  for (let x = 0; x < xs.length - 1; x += 1) for (let z = 0; z < zs.length - 1; z += 1) {
    const center = { x: (xs[x]! + xs[x + 1]!) / 2, z: (zs[z]! + zs[z + 1]!) / 2 };
    const blocked = rects.some((rect) => {
      const half = rotatedHalfExtents(rect, rect.rotationY);
      return Math.abs(center.x - rect.center.x) < half.x && Math.abs(center.z - rect.center.z) < half.z;
    });
    if (!blocked) largest = Math.max(largest, (xs[x + 1]! - xs[x]!) * (zs[z + 1]! - zs[z]!));
  }
  return largest / (scene.room.width * scene.room.depth);
};

const cohesionQuality = (seating: readonly PlanningEntity[], arrangement: Arrangement): number => {
  if (seating.length < 2) return 1;
  const rects = movableRects(seating, arrangement);
  const centroid = clusterCentroid(rects);
  const spread = rects.reduce((sum, rect) => sum + Math.hypot(rect.center.x - centroid.x, rect.center.z - centroid.z), 0) / rects.length;
  return Math.max(0, 1 - spread / 3);
};

const evaluateOpenSpace = (scene: PlanningScene, movable: readonly PlanningEntity[], seating: readonly PlanningEntity[], arrangement: Arrangement): RuleEvaluation[] => {
  const rects = movableRects(movable, arrangement);
  return [
    { id: 'openSpace.largestRegion', quality: largestRegionQuality(scene, rects) },
    { id: 'openSpace.openArea', quality: floorOpenArea(scene.room, rects) / (scene.room.width * scene.room.depth) },
    { id: 'openSpace.cohesion', quality: cohesionQuality(seating, arrangement) },
    { id: 'openSpace.edgeBias', quality: edgeBias(scene.room, rects) },
  ];
};

const uniqueCandidates = (candidates: Candidate[]): Candidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.position.x.toFixed(8)}:${candidate.position.z.toFixed(8)}:${candidate.rotationY.toFixed(8)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
};

const wallCandidates = (scene: PlanningScene, entity: PlanningEntity): Candidate[] => {
  const candidates: Candidate[] = [{ ...entity.transform, key: 'current' }];
  const walls = [
    { id: 'left', axis: 'x' as const, sign: -1, heading: Math.PI / 2 },
    { id: 'right', axis: 'x' as const, sign: 1, heading: -Math.PI / 2 },
    { id: 'back', axis: 'z' as const, sign: -1, heading: 0 },
    { id: 'front', axis: 'z' as const, sign: 1, heading: Math.PI },
  ];
  for (const wall of walls) {
    const half = rotatedHalfExtents(entity.footprint, wall.heading);
    const normal = wall.axis === 'x'
      ? wall.sign * (scene.room.width / 2 - half.x - OPEN_SPACE_LAYOUT_HEURISTICS.wallClearance)
      : wall.sign * (scene.room.depth / 2 - half.z - OPEN_SPACE_LAYOUT_HEURISTICS.wallClearance);
    for (const [index, factor] of OPEN_SPACE_LAYOUT_HEURISTICS.wallAlongFactors.entries()) {
      const alongLimit = wall.axis === 'x' ? scene.room.depth / 2 - half.z : scene.room.width / 2 - half.x;
      const along = factor * alongLimit;
      candidates.push({
        position: wall.axis === 'x' ? { x: normal, z: along } : { x: along, z: normal },
        rotationY: wall.heading,
        key: `wall-${wall.id}-${index}`,
      });
    }
  }
  return uniqueCandidates(candidates).slice(0, 8);
};

const sofaCandidates = (scene: PlanningScene, sofa: PlanningEntity): Candidate[] => {
  const candidates = wallCandidates(scene, sofa);
  return uniqueCandidates([
    ...candidates,
    { ...sofa.transform, rotationY: xzHeading(sofa.transform.position, { x: 0, z: 0 }), key: 'current-facing-center' },
  ]);
};

const chairCandidates = (chair: PlanningEntity, sofaTransform: PlanningTransform): Candidate[] => {
  const cosine = Math.cos(sofaTransform.rotationY); const sine = Math.sin(sofaTransform.rotationY);
  const candidates: Candidate[] = [{ ...chair.transform, key: 'current' }];
  OPEN_SPACE_LAYOUT_HEURISTICS.seating.armchairSlots.forEach(([lateral, forward], index) => {
    const position = { x: sofaTransform.position.x + lateral! * cosine + forward! * sine, z: sofaTransform.position.z - lateral! * sine + forward! * cosine };
    candidates.push({ position, rotationY: xzHeading(position, sofaTransform.position), key: `cluster-${index}` });
  });
  return uniqueCandidates(candidates);
};

const tableCandidates = (table: PlanningEntity, sofaTransform: PlanningTransform): Candidate[] => {
  const cosine = Math.cos(sofaTransform.rotationY); const sine = Math.sin(sofaTransform.rotationY);
  const candidates: Candidate[] = [{ ...table.transform, key: 'current' }];
  OPEN_SPACE_LAYOUT_HEURISTICS.seating.tableSlots.forEach(([lateral, forward], index) => {
    const position = { x: sofaTransform.position.x + lateral! * cosine + forward! * sine, z: sofaTransform.position.z - lateral! * sine + forward! * cosine };
    candidates.push({ position, rotationY: sofaTransform.rotationY, key: `cluster-${index}` });
  });
  return uniqueCandidates(candidates);
};

const findings = (before: LayoutQuality, after: LayoutQuality, outcome: SelectionOutcome, ids: string[]): PlanningFinding[] => {
  if (outcome === 'no-valid-plan') return [{ ruleId: 'openSpace.pathWidth', code: 'path-too-narrow', severity: 'warning', objectIds: ids }];
  if (outcome !== 'improved') return [{ ruleId: 'layout.selection', code: `layout-${outcome}`, severity: 'info', params: { score: before.total } }];
  const result: PlanningFinding[] = [];
  const labels: Array<[string, string]> = [
    ['openSpace.largestRegion', 'open-space-region-improved'], ['openSpace.openArea', 'open-area-improved'],
    ['openSpace.cohesion', 'seating-cohesion-improved'], ['openSpace.edgeBias', 'edge-bias-improved'],
  ];
  for (const [id, code] of labels) if ((after.components[id] ?? 0) > (before.components[id] ?? 0) + EPSILON) {
    result.push({ ruleId: id, code, severity: 'positive', objectIds: ids });
  }
  result.push({ ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive', objectIds: ids, params: { improvement: after.total - before.total } });
  return result;
};

const sceneWithTransforms = (scene: PlanningScene, transforms: ReadonlyMap<string, PlanningTransform>): PlanningScene => ({
  ...scene,
  entities: scene.entities.map((entity) => ({ ...entity, transform: transforms.get(entity.id) ?? entity.transform })),
});

/** Plans an airy arrangement in two deterministic passes: seating, then decor. */
export const planOpenSpace = (scene: PlanningScene): PlanProposal => {
  const group = validateOpenSpaceApplicability(scene);
  const seating = [group.sofa, ...(group.armchair ? [group.armchair] : []), ...(group.coffeeTable ? [group.coffeeTable] : [])];
  const allMovable = group.movable;
  const contextFor = (movable: readonly PlanningEntity[], currentScene: PlanningScene) => currentScene.entities.filter((entity) => !movable.some((active) => active.id === entity.id));
  const ruleWeights = Object.entries(OPEN_SPACE_LAYOUT_HEURISTICS.weights).map(([id, weight]) => ({ id: `openSpace.${id}`, weight }));
  const pathConstraint = (currentScene: PlanningScene) => (arrangement: Arrangement) =>
    pathWidth(currentScene.room, movableRects(allMovable, arrangement)) >= OPEN_SPACE_LAYOUT_HEURISTICS.minPathWidth - EPSILON;

  const seatingDimensions: CandidateDimension[] = seating.map((entity) => ({
    entity,
    provide: (arrangement) => entity.id === group.sofa.id ? sofaCandidates(scene, entity)
      : entity.role === 'armchair' ? chairCandidates(entity, transformFor(group.sofa, arrangement))
        : tableCandidates(entity, transformFor(group.sofa, arrangement)),
  }));
  const seatingResult = runLivingRoomLayout({
    scene,
    activeGroup: { participants: seating, movable: seating, fixedContext: contextFor(seating, scene) },
    selectionPolicy: OPEN_SPACE_SELECTION_POLICY,
    dimensions: seatingDimensions,
    evaluateRules: (arrangement) => evaluateOpenSpace(scene, allMovable, seating, arrangement),
    ruleWeights,
    arrangementConstraint: pathConstraint(scene),
    buildFindings: (before, after, outcome) => findings(before, after, outcome, seating.map(roomObjectInstanceId)),
  });

  const transforms = new Map<string, PlanningTransform>();
  for (const entity of allMovable) transforms.set(entity.id, seatingResult.selection.arrangement.get(entity.id) ?? entity.transform);
  let workingScene = sceneWithTransforms(scene, transforms);
  const allFindings = [...seatingResult.proposal.findings];
  for (const decor of group.decor) {
    const currentMovable = allMovable;
    const decorResult = runLivingRoomLayout({
      scene: workingScene,
      activeGroup: { participants: [decor], movable: [decor], fixedContext: contextFor([decor], workingScene) },
      selectionPolicy: OPEN_SPACE_SELECTION_POLICY,
      dimensions: [{ entity: decor, provide: () => wallCandidates(workingScene, decor) }],
      evaluateRules: (arrangement) => evaluateOpenSpace(workingScene, currentMovable, seating, arrangement),
      ruleWeights,
      arrangementConstraint: pathConstraint(workingScene),
      buildFindings: (before, after, outcome) => findings(before, after, outcome, [roomObjectInstanceId(decor)]),
    });
    if (decorResult.selection.outcome === 'improved') {
      const next = decorResult.selection.arrangement.get(decor.id);
      if (next) { transforms.set(decor.id, next); workingScene = sceneWithTransforms(workingScene, transforms); }
    }
    allFindings.push(...decorResult.proposal.findings);
  }

  const initialArrangement = new Map<string, Candidate>(allMovable.map((entity) => [entity.id, { ...entity.transform, key: 'current' }]));
  const finalArrangement = new Map<string, Candidate>(allMovable.map((entity) => [entity.id, { ...(transforms.get(entity.id) ?? entity.transform), key: 'selected' }]));
  const before = evaluateOpenSpace(scene, allMovable, seating, initialArrangement);
  const after = evaluateOpenSpace(scene, allMovable, seating, finalArrangement);
  const weighted = (evaluations: readonly RuleEvaluation[]) => {
    const total = ruleWeights.reduce((sum, rule) => sum + (evaluations.find((evaluation) => evaluation.id === rule.id)?.quality ?? 0) * rule.weight, 0) / ruleWeights.reduce((sum, rule) => sum + rule.weight, 0);
    return total * 100;
  };
  const moves = allMovable.filter((entity) => {
    const next = transforms.get(entity.id)!; return Math.hypot(next.position.x - entity.transform.position.x, next.position.z - entity.transform.position.z) > EPSILON
      || Math.abs(next.rotationY - entity.transform.rotationY) > EPSILON;
  }).map((entity) => ({ instanceId: roomObjectInstanceId(entity), position: { ...transforms.get(entity.id)!.position }, rotationY: transforms.get(entity.id)!.rotationY }));
  return {
    moves,
    scoreBefore: { total: weighted(before) },
    scoreAfter: { total: weighted(after) },
    findings: allFindings,
  };
};
