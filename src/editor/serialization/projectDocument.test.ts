import { describe, expect, it } from 'vitest';
import {
  MAX_PROJECT_OBJECTS,
  ProjectDocumentError,
  hashRoomProjectDocument,
  parseRoomProjectDocument,
  serializeRoomProjectCanonical,
} from './projectDocument';
import { createDefaultProject, type RoomProject } from '../model/types';

const validProject = (): RoomProject => ({
  version: 1,
  room: { width: 4, depth: 5, height: 2.7 },
  finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
  objects: [
    { instanceId: 'i-1', assetId: 'sofa-a', position: { x: 0.5, y: 0, z: -1 }, rotationY: Math.PI },
    { instanceId: 'i-2', assetId: 'tv-basic', position: { x: 0, y: 0.4, z: 2.3 }, rotationY: 0, variantId: 'wall' },
  ],
});

const roundTrip = (project: RoomProject): Record<string, unknown> =>
  JSON.parse(serializeRoomProjectCanonical(project)) as Record<string, unknown>;

describe('parseRoomProjectDocument', () => {
  it('accepts a complete v1 document and preserves variantId and order', () => {
    const parsed = parseRoomProjectDocument(roundTrip(validProject()));
    expect(parsed).toEqual(validProject());
  });

  it('rejects unsupported versions', () => {
    const document = { ...roundTrip(validProject()), version: 2 };
    expect(() => parseRoomProjectDocument(document)).toThrow(ProjectDocumentError);
  });

  it('rejects unknown root fields', () => {
    const document = { ...roundTrip(validProject()), ownerId: 'attacker' };
    expect(() => parseRoomProjectDocument(document)).toThrow(ProjectDocumentError);
  });

  it('rejects unknown object fields at every level', () => {
    const document = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    document.objects[0]!.collides = false;
    expect(() => parseRoomProjectDocument(document)).toThrow(ProjectDocumentError);
  });

  it('rejects malformed position vectors', () => {
    const document = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    document.objects[0]!.position = { x: 0, y: 0 };
    expect(() => parseRoomProjectDocument(document)).toThrow(ProjectDocumentError);
  });

  it('rejects NaN/infinity and non-number transforms', () => {
    const nan = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    nan.objects[0]!.position = { x: Number.NaN, y: 0, z: 0 };
    expect(() => parseRoomProjectDocument(nan)).toThrow(ProjectDocumentError);
    const infinite = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    infinite.objects[1]!.rotationY = Number.POSITIVE_INFINITY;
    expect(() => parseRoomProjectDocument(infinite)).toThrow(ProjectDocumentError);
    const stringY = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    stringY.objects[0]!.position = { x: 0, y: '0', z: 0 };
    expect(() => parseRoomProjectDocument(stringY)).toThrow(ProjectDocumentError);
  });

  it('rejects invalid room dimensions', () => {
    const negative = roundTrip(validProject()) as { room: Record<string, number> };
    negative.room.depth = -5;
    expect(() => parseRoomProjectDocument(negative)).toThrow(ProjectDocumentError);
    const huge = roundTrip(validProject()) as { room: Record<string, number> };
    huge.room.width = 501;
    expect(() => parseRoomProjectDocument(huge)).toThrow(ProjectDocumentError);
    const tall = roundTrip(validProject()) as { room: Record<string, number> };
    tall.room.height = 51;
    expect(() => parseRoomProjectDocument(tall)).toThrow(ProjectDocumentError);
  });

  it('rejects oversized or empty identifiers', () => {
    const longInstance = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    longInstance.objects[0]!.instanceId = 'x'.repeat(129);
    expect(() => parseRoomProjectDocument(longInstance)).toThrow(ProjectDocumentError);
    const longFinish = roundTrip(validProject()) as { finishes: Record<string, string> };
    longFinish.finishes.floorMaterialId = 'x'.repeat(65);
    expect(() => parseRoomProjectDocument(longFinish)).toThrow(ProjectDocumentError);
    const longVariant = roundTrip(validProject()) as { objects: Array<Record<string, unknown>> };
    longVariant.objects[1]!.variantId = 'x'.repeat(65);
    expect(() => parseRoomProjectDocument(longVariant)).toThrow(ProjectDocumentError);
  });

  it('rejects duplicate instanceIds', () => {
    const document = validProject();
    document.objects = [document.objects[0]!, { ...document.objects[1]!, instanceId: document.objects[0]!.instanceId }];
    expect(() => parseRoomProjectDocument(roundTrip(document))).toThrow(ProjectDocumentError);
  });

  it('enforces the structural object cap', () => {
    const base = createDefaultProject();
    const many: RoomProject = {
      ...base,
      objects: Array.from({ length: MAX_PROJECT_OBJECTS + 1 }, (_, index) => ({
        instanceId: `i-${index}`,
        assetId: 'a',
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
      })),
    };
    expect(() => parseRoomProjectDocument(roundTrip(many))).toThrow(ProjectDocumentError);
  });
});

describe('canonical serialization and digest', () => {
  it('is deterministic for identical documents', () => {
    expect(serializeRoomProjectCanonical(validProject())).toBe(
      serializeRoomProjectCanonical(parseRoomProjectDocument(roundTrip(validProject()))),
    );
  });

  it('digest changes for finishes, variantId, transforms and identity/order', async () => {
    const baseHash = await hashRoomProjectDocument(validProject());

    const floorChanged = structuredClone(validProject());
    floorChanged.finishes.floorMaterialId = 'walnut';
    expect(await hashRoomProjectDocument(floorChanged)).not.toBe(baseHash);

    const wallChanged = structuredClone(validProject());
    wallChanged.finishes.wallMaterialId = 'mist';
    expect(await hashRoomProjectDocument(wallChanged)).not.toBe(baseHash);

    const variantDropped = structuredClone(validProject());
    delete (variantDropped.objects[1] as { variantId?: string }).variantId;
    expect(await hashRoomProjectDocument(variantDropped)).not.toBe(baseHash);

    const moved = structuredClone(validProject());
    moved.objects[0]!.position.z += 0.01;
    expect(await hashRoomProjectDocument(moved)).not.toBe(baseHash);

    const reordered = structuredClone(validProject());
    reordered.objects.reverse();
    expect(await hashRoomProjectDocument(reordered)).not.toBe(baseHash);

    const renamed = structuredClone(validProject());
    renamed.objects[0]!.assetId = 'sofa-b';
    expect(await hashRoomProjectDocument(renamed)).not.toBe(baseHash);
  });

  it('covers the default project as a stable baseline', async () => {
    const hash = await hashRoomProjectDocument(createDefaultProject());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashRoomProjectDocument(createDefaultProject())).toBe(hash);
  });
});
