import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec2 } from '@/editor/model/types';
import { isPlacementValid } from './collision';
import { resolveSnap, snapToGrid } from './snap';

export { isPlacementValid } from './collision';
export { GRID_STEP, resolveSnap, snapToGrid } from './snap';

export const findPlacement = (project: RoomProject, assetId: string): Vec2 | null => {
  const asset = getAsset(assetId);
  for (let ring = 0; ring < 22; ring += 1) {
    const count = Math.max(1, ring * 8);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2;
      const raw = { x: snapToGrid(Math.cos(angle) * ring * 0.2), z: snapToGrid(Math.sin(angle) * ring * 0.2) };
      const resolved = resolveSnap(raw, project, asset, 0).position;
      const candidate: FurnitureInstance = {
        instanceId: 'candidate', assetId, position: { ...resolved, y: 0 }, rotationY: 0,
      };
      if (isPlacementValid(project, candidate)) return resolved;
    }
  }
  return null;
};
