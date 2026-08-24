import { getAsset } from '@/editor/assets/registry';
import type { FurnitureAssetDefinition, FurnitureSemanticRole, RoomProject } from '@/editor/model/types';
import type { PlanningEntity, PlanningEntityRole, PlanningPlacementType, PlanningScene } from '@/editor/planning/livingRoom';

export type AssetDefinitionResolver = (assetId: string) => FurnitureAssetDefinition;

export const planningRoomObjectEntityId = (instanceId: string): string => `room-object:${instanceId}`;

export class PlanningSceneBuildError extends Error {
  constructor(
    public readonly code: 'invalid-project' | 'unknown-asset' | 'unsupported-placement' | 'unsupported-layout' | 'no-tv' | 'ambiguous-tv',
    message: string,
  ) {
    super(message);
    this.name = 'PlanningSceneBuildError';
  }
}

const activeRole = (role: FurnitureSemanticRole | undefined): PlanningEntityRole => {
  if (role === 'tv' || role === 'sofa' || role === 'armchair' || role === 'coffeeTable' || role === 'floorLamp') return role;
  return 'obstacle';
};

const planningPlacement = (asset: FurnitureAssetDefinition, role: PlanningEntityRole): PlanningPlacementType => {
  if (asset.placement.anchor === 'floor') return 'floor';
  if (role === 'tv' && asset.placement.anchor === 'wall') return 'wall';
  throw new PlanningSceneBuildError('unsupported-placement', `Unsupported placement for ${asset.id}: ${asset.placement.anchor}`);
};

const assertFinitePositive = (values: number[], label: string) => {
  if (!values.every((value) => Number.isFinite(value) && value > 0)) {
    throw new PlanningSceneBuildError('invalid-project', `Invalid ${label}`);
  }
};

export const buildPlanningScene = (
  project: RoomProject,
  resolveAsset: AssetDefinitionResolver = getAsset,
): PlanningScene => {
  assertFinitePositive([project.room.width, project.room.depth], 'room dimensions');
  const sourceIds = new Set<string>();
  const entities: PlanningEntity[] = project.objects.map((object) => {
    if (sourceIds.has(object.instanceId)) throw new PlanningSceneBuildError('invalid-project', `Duplicate room object ID: ${object.instanceId}`);
    sourceIds.add(object.instanceId);
    if (![object.position.x, object.position.y, object.position.z, object.rotationY].every(Number.isFinite)) {
      throw new PlanningSceneBuildError('invalid-project', `Invalid transform for ${object.instanceId}`);
    }
    let asset: FurnitureAssetDefinition;
    try { asset = resolveAsset(object.assetId); } catch {
      throw new PlanningSceneBuildError('unknown-asset', `Unknown asset metadata: ${object.assetId}`);
    }
    assertFinitePositive([asset.footprint.width, asset.footprint.depth], `footprint for ${asset.id}`);
    const role = activeRole(asset.semantic?.role);
    return {
      id: planningRoomObjectEntityId(object.instanceId),
      source: { kind: 'roomObject', instanceId: object.instanceId },
      role,
      placementType: planningPlacement(asset, role),
      footprint: { ...asset.footprint },
      collision: { ...asset.collision },
      transform: { position: { x: object.position.x, z: object.position.z }, rotationY: object.rotationY },
    };
  });
  const sofas = entities.filter((entity) => entity.role === 'sofa');
  const chairs = entities.filter((entity) => entity.role === 'armchair');
  const tables = entities.filter((entity) => entity.role === 'coffeeTable');
  if (sofas.length !== 1 || chairs.length > 2 || tables.length > 1) {
    throw new PlanningSceneBuildError('unsupported-layout', 'TV planner supports one sofa, up to two armchairs, and up to one coffee table');
  }
  return {
    room: { width: project.room.width, depth: project.room.depth },
    immediateOpeningZones: [],
    circulationZones: [],
    entities,
  };
};

export const resolveSingleTvFocalId = (scene: PlanningScene): string => {
  const televisions = scene.entities.filter((entity) => entity.role === 'tv');
  if (televisions.length === 0) throw new PlanningSceneBuildError('no-tv', 'No authoritative TV focal exists in the room');
  if (televisions.length > 1) throw new PlanningSceneBuildError('ambiguous-tv', 'Multiple authoritative TV focal entities exist in the room');
  return televisions[0]!.id;
};
