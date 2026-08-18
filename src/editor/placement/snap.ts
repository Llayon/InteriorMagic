import type { FurnitureAssetDefinition, RoomProject, Vec2 } from '@/editor/model/types';
import { getRotatedHalfExtents } from './collision';

export const GRID_STEP = 0.05;
export const WALL_SNAP_THRESHOLD = 0.05;
export const WALL_RELEASE_THRESHOLD = 0.09;

export interface SnapAxisState {
  type: 'wall' | 'grid';
  targetId: string;
  value: number;
}
export interface SnapState { x?: SnapAxisState; z?: SnapAxisState }
export interface SnapResult { position: Vec2; state: SnapState }

export const snapToGrid = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP;

type WallTarget = { axis: 'x' | 'z'; id: string; value: number; gap: number };

const wallTargets = (
  raw: Vec2,
  project: RoomProject,
  asset: FurnitureAssetDefinition,
  rotationY: number,
): WallTarget[] => {
  const extent = getRotatedHalfExtents(asset.footprint.width, asset.footprint.depth, rotationY);
  const halfWidth = project.room.width / 2;
  const halfDepth = project.room.depth / 2;
  return [
    { axis: 'x', id: 'wall:left', value: -halfWidth + extent.x, gap: raw.x - extent.x + halfWidth },
    { axis: 'x', id: 'wall:right', value: halfWidth - extent.x, gap: halfWidth - raw.x - extent.x },
    { axis: 'z', id: 'wall:back', value: -halfDepth + extent.z, gap: raw.z - extent.z + halfDepth },
    { axis: 'z', id: 'wall:front', value: halfDepth - extent.z, gap: halfDepth - raw.z - extent.z },
  ];
};

const resolveAxis = (
  axis: 'x' | 'z',
  rawValue: number,
  targets: WallTarget[],
  current: SnapAxisState | undefined,
  wallEnabled: boolean,
): SnapAxisState => {
  if (wallEnabled && current?.type === 'wall') {
    const target = targets.find((candidate) => candidate.id === current.targetId);
    if (target && Math.abs(target.gap) <= WALL_RELEASE_THRESHOLD) {
      return { type: 'wall', targetId: target.id, value: target.value };
    }
  }
  if (wallEnabled) {
    const target = targets
      .filter((candidate) => candidate.axis === axis && Math.abs(candidate.gap) <= WALL_SNAP_THRESHOLD + 1e-9)
      .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0];
    if (target) return { type: 'wall', targetId: target.id, value: target.value };
  }
  const value = snapToGrid(rawValue);
  return { type: 'grid', targetId: `grid:${axis}:${Math.round(value / GRID_STEP)}`, value };
};

export const constrainToRoom = (
  position: Vec2,
  project: RoomProject,
  asset: FurnitureAssetDefinition,
  rotationY: number,
): Vec2 => {
  const extent = getRotatedHalfExtents(asset.footprint.width, asset.footprint.depth, rotationY);
  return {
    x: Math.max(-project.room.width / 2 + extent.x, Math.min(project.room.width / 2 - extent.x, position.x)),
    z: Math.max(-project.room.depth / 2 + extent.z, Math.min(project.room.depth / 2 - extent.z, position.z)),
  };
};

export const resolveSnap = (
  raw: Vec2,
  project: RoomProject,
  asset: FurnitureAssetDefinition,
  rotationY: number,
  previous: SnapState = {},
): SnapResult => {
  const targets = wallTargets(raw, project, asset, rotationY);
  const x = resolveAxis('x', raw.x, targets, previous.x, asset.snapping.walls);
  const z = resolveAxis('z', raw.z, targets, previous.z, asset.snapping.walls);
  const snapped = {
    x: x.type === 'wall' || asset.snapping.grid ? x.value : raw.x,
    z: z.type === 'wall' || asset.snapping.grid ? z.value : raw.z,
  };
  return { position: constrainToRoom(snapped, project, asset, rotationY), state: { x, z } };
};
