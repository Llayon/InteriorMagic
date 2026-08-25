import { getAsset } from '@/editor/assets/registry';
import type { RoomProject } from '@/editor/model/types';
import { projectPlanningScene, type AssetDefinitionResolver } from './projectPlanningScene';
import { resolveSingleTvFocalId, validateTvApplicability } from '@/editor/planning/tv';

export type TvPlannerCapability =
  | { available: true; focalPointId: string }
  | { available: false };

/** Resolves only the authoritative, unambiguous TV focal needed to expose the product entry. */
export const resolveTvPlannerCapability = (
  project: RoomProject,
  resolveAsset: AssetDefinitionResolver = getAsset,
): TvPlannerCapability => {
  try {
    const scene = projectPlanningScene(project, resolveAsset);
    validateTvApplicability(scene);
    return { available: true, focalPointId: resolveSingleTvFocalId(scene) };
  } catch {
    return { available: false };
  }
};
