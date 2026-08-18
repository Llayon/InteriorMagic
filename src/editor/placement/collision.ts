import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec2 } from '@/editor/model/types';

export const getRotatedHalfExtents = (width: number, depth: number, rotationY: number) => ({
  x: Math.abs(Math.cos(rotationY)) * width / 2 + Math.abs(Math.sin(rotationY)) * depth / 2,
  z: Math.abs(Math.sin(rotationY)) * width / 2 + Math.abs(Math.cos(rotationY)) * depth / 2,
});

export const getObbCorners = (object: FurnitureInstance): Vec2[] => {
  const footprint = getAsset(object.assetId).footprint;
  const c = Math.cos(object.rotationY);
  const s = Math.sin(object.rotationY);
  return [
    [-footprint.width / 2, -footprint.depth / 2],
    [footprint.width / 2, -footprint.depth / 2],
    [footprint.width / 2, footprint.depth / 2],
    [-footprint.width / 2, footprint.depth / 2],
  ].map(([x, z]) => ({
    x: object.position.x + x! * c - z! * s,
    z: object.position.z + x! * s + z! * c,
  }));
};

const axes = (points: Vec2[]) => points.slice(0, 2).map((point, index) => {
  const next = points[(index + 1) % points.length]!;
  const dx = next.x - point.x;
  const dz = next.z - point.z;
  const length = Math.hypot(dx, dz);
  return { x: -dz / length, z: dx / length };
});

export const orientedRectsIntersect = (a: Vec2[], b: Vec2[]) =>
  [...axes(a), ...axes(b)].every((axis) => {
    const pa = a.map((point) => point.x * axis.x + point.z * axis.z);
    const pb = b.map((point) => point.x * axis.x + point.z * axis.z);
    return Math.max(...pa) > Math.min(...pb) + 0.005 && Math.max(...pb) > Math.min(...pa) + 0.005;
  });

export const collisionMasksOverlap = (
  a: { group: number; mask: number },
  b: { group: number; mask: number },
) => (a.mask & b.group) !== 0 && (b.mask & a.group) !== 0;

export const isInsideRoom = (project: RoomProject, object: FurnitureInstance) => {
  const halfWidth = project.room.width / 2;
  const halfDepth = project.room.depth / 2;
  return getObbCorners(object).every((point) =>
    point.x >= -halfWidth - 1e-6 && point.x <= halfWidth + 1e-6 &&
    point.z >= -halfDepth - 1e-6 && point.z <= halfDepth + 1e-6);
};

export const isPlacementValid = (
  project: RoomProject,
  candidate: FurnitureInstance,
  ignoreId = candidate.instanceId,
) => {
  if (!isInsideRoom(project, candidate)) return false;
  const candidateAsset = getAsset(candidate.assetId);
  const candidateCorners = getObbCorners(candidate);
  return !project.objects.some((object) => {
    if (object.instanceId === ignoreId) return false;
    const otherAsset = getAsset(object.assetId);
    return collisionMasksOverlap(candidateAsset.collision, otherAsset.collision) &&
      orientedRectsIntersect(candidateCorners, getObbCorners(object));
  });
};

export interface ClearanceViolation { sourceId: string; targetId: string }
export const evaluateClearance = (): ClearanceViolation[] => [];
