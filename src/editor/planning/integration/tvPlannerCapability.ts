import { getAsset } from '@/editor/assets/registry';
import type { RoomProject } from '@/editor/model/types';
import { planningRoomObjectEntityId, type AssetDefinitionResolver } from './buildPlanningScene';

export type TvPlannerCapability =
  | { available: true; focalPointId: string }
  | { available: false };

/** Resolves only the authoritative, unambiguous TV focal needed to expose the product entry. */
export const resolveTvPlannerCapability = (
  project: RoomProject,
  resolveAsset: AssetDefinitionResolver = getAsset,
): TvPlannerCapability => {
  const focalIds: string[] = [];
  try {
    for (const object of project.objects) {
      const asset = resolveAsset(object.assetId);
      if (asset.semantic?.role !== 'tv') continue;
      if (asset.placement.anchor !== 'floor' && asset.placement.anchor !== 'wall') return { available: false };
      focalIds.push(planningRoomObjectEntityId(object.instanceId));
    }
  } catch {
    return { available: false };
  }
  return focalIds.length === 1 ? { available: true, focalPointId: focalIds[0]! } : { available: false };
};
