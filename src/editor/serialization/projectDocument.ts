/** Strict RoomProject v1 document boundary shared by browser and app-api Worker.
 *
 *  This validates document INTEGRITY only: exact shape, finite numbers, bounded
 *  opaque identifiers, unique instance ids. It deliberately does not validate
 *  catalog existence, collision, placement quality or planner applicability.
 *  The sync digest covers the complete canonical document — including finishes
 *  and variantId — unlike planningProjectFingerprint, which is a planner-scene
 *  staleness signal and must not be reused for persistence. */

import type { FurnitureInstance, RoomProject, Vec3 } from '../model/types';

export class ProjectDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectDocumentError';
  }
}

export const MAX_PROJECT_OBJECTS = 500;
export const MAX_INSTANCE_ID_LENGTH = 128;
export const MAX_ASSET_ID_LENGTH = 128;
export const MAX_VARIANT_ID_LENGTH = 64;
export const MAX_MATERIAL_ID_LENGTH = 64;
export const MAX_ROOM_WIDTH_DEPTH = 500;
export const MAX_ROOM_HEIGHT = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (record: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const expected = new Set(allowed);
  const present = new Set(Object.keys(record));
  if (present.size !== expected.size) return false;
  for (const key of present) if (!expected.has(key)) return false;
  return true;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isBoundedId = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;

const parseVec3 = (value: unknown): Vec3 => {
  if (!isRecord(value) || !hasExactKeys(value, ['x', 'y', 'z'])) {
    throw new ProjectDocumentError('position must contain exactly x, y, z');
  }
  const { x, y, z } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    throw new ProjectDocumentError('position components must be finite numbers');
  }
  return { x, y, z };
};

const parseObject = (value: unknown): FurnitureInstance => {
  if (!isRecord(value) || !hasExactKeys(value, ['instanceId', 'assetId', 'position', 'rotationY', 'variantId'])) {
    // variantId is optional; retry below without it before failing.
    if (!isRecord(value) || !hasExactKeys(value, ['instanceId', 'assetId', 'position', 'rotationY'])) {
      throw new ProjectDocumentError('object must contain exactly instanceId, assetId, position, rotationY and optional variantId');
    }
    const instanceId = value['instanceId'];
    if (!isBoundedId(instanceId, MAX_INSTANCE_ID_LENGTH)) throw new ProjectDocumentError('invalid instanceId');
    const assetId = value['assetId'];
    if (!isBoundedId(assetId, MAX_ASSET_ID_LENGTH)) throw new ProjectDocumentError('invalid assetId');
    const position = parseVec3(value['position']);
    const rotationY = value['rotationY'];
    if (!isFiniteNumber(rotationY)) throw new ProjectDocumentError('rotationY must be a finite number');
    return { instanceId, assetId, position, rotationY };
  }
  const instanceId = value['instanceId'];
  if (!isBoundedId(instanceId, MAX_INSTANCE_ID_LENGTH)) throw new ProjectDocumentError('invalid instanceId');
  const assetId = value['assetId'];
  if (!isBoundedId(assetId, MAX_ASSET_ID_LENGTH)) throw new ProjectDocumentError('invalid assetId');
  const position = parseVec3(value['position']);
  const rotationY = value['rotationY'];
  if (!isFiniteNumber(rotationY)) throw new ProjectDocumentError('rotationY must be a finite number');
  const variantId = value['variantId'];
  if (!isBoundedId(variantId, MAX_VARIANT_ID_LENGTH)) throw new ProjectDocumentError('invalid variantId');
  return { instanceId, assetId, position, rotationY, variantId };
};

/** Strictly validates a persisted RoomProject v1 document. */
export function parseRoomProjectDocument(value: unknown): RoomProject {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'room', 'finishes', 'objects'])) {
    throw new ProjectDocumentError('project must contain exactly version, room, finishes and objects');
  }
  if (value['version'] !== 1) throw new ProjectDocumentError('unsupported project version');

  const roomValue = value['room'];
  if (!isRecord(roomValue) || !hasExactKeys(roomValue, ['width', 'depth', 'height'])) {
    throw new ProjectDocumentError('room must contain exactly width, depth and height');
  }
  const width = roomValue['width'];
  const depth = roomValue['depth'];
  const height = roomValue['height'];
  if (
    !isFiniteNumber(width) ||
    !isFiniteNumber(depth) ||
    !isFiniteNumber(height) ||
    width <= 0 ||
    depth <= 0 ||
    height <= 0 ||
    width > MAX_ROOM_WIDTH_DEPTH ||
    depth > MAX_ROOM_WIDTH_DEPTH ||
    height > MAX_ROOM_HEIGHT
  ) {
    throw new ProjectDocumentError('room dimensions are outside the supported range');
  }

  const finishesValue = value['finishes'];
  if (!isRecord(finishesValue) || !hasExactKeys(finishesValue, ['floorMaterialId', 'wallMaterialId'])) {
    throw new ProjectDocumentError('finishes must contain exactly floorMaterialId and wallMaterialId');
  }
  const floorMaterialId = finishesValue['floorMaterialId'];
  const wallMaterialId = finishesValue['wallMaterialId'];
  if (!isBoundedId(floorMaterialId, MAX_MATERIAL_ID_LENGTH)) throw new ProjectDocumentError('invalid floorMaterialId');
  if (!isBoundedId(wallMaterialId, MAX_MATERIAL_ID_LENGTH)) throw new ProjectDocumentError('invalid wallMaterialId');

  const objectsValue = value['objects'];
  if (!Array.isArray(objectsValue) || objectsValue.length > MAX_PROJECT_OBJECTS) {
    throw new ProjectDocumentError('objects must be an array within the supported size');
  }
  const seenInstanceIds = new Set<string>();
  const objects = objectsValue.map((entry) => {
    const parsed = parseObject(entry);
    if (seenInstanceIds.has(parsed.instanceId)) throw new ProjectDocumentError('duplicate instanceId');
    seenInstanceIds.add(parsed.instanceId);
    return parsed;
  });

  return {
    version: 1,
    room: { width, depth, height },
    finishes: { floorMaterialId, wallMaterialId },
    objects,
  };
}

/** Deterministic canonical serialization with fixed key ordering. Object array
 *  order is preserved: it is part of the persisted document identity. */
export function serializeRoomProjectCanonical(project: RoomProject): string {
  const canonical = {
    version: project.version,
    room: {
      width: project.room.width,
      depth: project.room.depth,
      height: project.room.height,
    },
    finishes: {
      floorMaterialId: project.finishes.floorMaterialId,
      wallMaterialId: project.finishes.wallMaterialId,
    },
    objects: project.objects.map((object) => ({
      instanceId: object.instanceId,
      assetId: object.assetId,
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotationY: object.rotationY,
      ...(object.variantId !== undefined ? { variantId: object.variantId } : {}),
    })),
  };
  return JSON.stringify(canonical);
}

/** SHA-256 hex digest of the canonical form. Available in browsers and workerd. */
export async function hashRoomProjectDocument(project: RoomProject): Promise<string> {
  const bytes = new TextEncoder().encode(serializeRoomProjectCanonical(project));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
