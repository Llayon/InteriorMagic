import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec2 } from '@/editor/model/types';
import { orientedCorners, orientedRectsOverlap, rectContainedInRoom, rotatedHalfExtents } from '@/editor/spatial/geometry';

export const getRotatedHalfExtents = (width: number, depth: number, rotationY: number) =>
  rotatedHalfExtents({ width, depth }, rotationY);

const objectRect = (object: FurnitureInstance) => {
  const footprint = getAsset(object.assetId).footprint;
  return { center: { x: object.position.x, z: object.position.z }, ...footprint, rotationY: object.rotationY };
};

export const getObbCorners = (object: FurnitureInstance): Vec2[] => orientedCorners(objectRect(object));

export const orientedRectsIntersect = (a: Vec2[], b: Vec2[]) => {
  const toRect = (corners: Vec2[]) => ({
    center: { x: (corners[0]!.x + corners[2]!.x) / 2, z: (corners[0]!.z + corners[2]!.z) / 2 },
    width: Math.hypot(corners[1]!.x - corners[0]!.x, corners[1]!.z - corners[0]!.z),
    depth: Math.hypot(corners[2]!.x - corners[1]!.x, corners[2]!.z - corners[1]!.z),
    rotationY: Math.atan2(corners[1]!.z - corners[0]!.z, corners[1]!.x - corners[0]!.x),
  });
  return orientedRectsOverlap(toRect(a), toRect(b));
};

export const collisionMasksOverlap = (
  a: { group: number; mask: number },
  b: { group: number; mask: number },
) => (a.mask & b.group) !== 0 && (b.mask & a.group) !== 0;

export const isInsideRoom = (project: RoomProject, object: FurnitureInstance) => {
  return rectContainedInRoom(project.room, objectRect(object));
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
