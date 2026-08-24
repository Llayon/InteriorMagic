import { PlanningError } from '@/editor/planning/errors';
import type { PlanningScene } from '@/editor/planning/livingRoom';

/** Resolves the single authoritative TV required by the default TV flow. */
export const resolveSingleTvFocalId = (scene: PlanningScene): string => {
  const televisions = scene.entities.filter((entity) => entity.role === 'tv');
  if (televisions.length === 0) {
    throw new PlanningError('FOCAL_NOT_FOUND', 'No authoritative TV focal exists in the room');
  }
  if (televisions.length > 1) {
    throw new PlanningError('FOCAL_AMBIGUOUS', 'Multiple authoritative TV focal entities exist in the room');
  }
  return televisions[0]!.id;
};

/** TV topology is scenario policy and must not be enforced by scene projection. */
export const validateTvTopology = (scene: PlanningScene): void => {
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa');
  const chairs = scene.entities.filter((entity) => entity.role === 'armchair');
  const tables = scene.entities.filter((entity) => entity.role === 'coffeeTable');
  if (sofas.length !== 1 || chairs.length > 2 || tables.length > 1) {
    throw new PlanningError('UNSUPPORTED_LAYOUT', 'TV planner supports one sofa, up to two armchairs, and up to one coffee table');
  }
};
