import type { FurnitureAssetDefinition, FurnitureInstance, FurnitureSemanticRole, PlacementAnchor, RoomProject } from '@/editor/model/types';

const definition = (
  id: string,
  role: FurnitureSemanticRole | undefined,
  footprint: { width: number; depth: number },
  collision = { group: 1, mask: 1 | 4 },
  anchor: PlacementAnchor = 'floor',
): FurnitureAssetDefinition => ({
  id, name: `Metadata ${id}`, icon: 'x', category: 'tables',
  dimensions: { ...footprint, height: 1 }, footprint, placement: { anchor }, collision,
  snapping: { grid: true, walls: true }, rotation: { enabled: true, stepDegrees: 45 },
  variants: [{ id: 'v', color: '#fff' }], tags: [], ...(role ? { semantic: { role } } : {}), fallbackPrimitive: 'table',
});

export const integrationAssetDefinitions: Record<string, FurnitureAssetDefinition> = {
  tvMeta: definition('tvMeta', 'tv', { width: 1.2, depth: .1 }, { group: 0, mask: 0 }, 'wall'),
  sofaMeta: definition('sofaMeta', 'sofa', { width: 2, depth: .9 }),
  chairMeta: definition('chairMeta', 'armchair', { width: .8, depth: .8 }),
  tableMeta: definition('tableMeta', 'coffeeTable', { width: 1, depth: .6 }),
  lampMeta: definition('lampMeta', 'floorLamp', { width: .3, depth: .3 }, { group: 4, mask: 1 | 4 }),
  cabinetMeta: definition('cabinetMeta', 'console', { width: 1, depth: .5 }),
  rugMeta: definition('rugMeta', 'rug', { width: 2.5, depth: 1.5 }, { group: 2, mask: 2 }),
  suspiciousName: definition('suspiciousName', undefined, { width: .5, depth: .5 }),
};

export const resolveIntegrationAsset = (assetId: string): FurnitureAssetDefinition => {
  const asset = integrationAssetDefinitions[assetId];
  if (!asset) throw new Error(`Unknown test asset: ${assetId}`);
  return asset;
};

export const roomObject = (instanceId: string, assetId: string, x: number, z: number, rotationY = 0): FurnitureInstance => ({
  instanceId, assetId, position: { x, y: 0, z }, rotationY,
});

export const createIntegrationProject = (options: { tv?: boolean; secondTv?: boolean; good?: boolean } = {}): RoomProject => {
  const good = options.good ?? false;
  const objects: FurnitureInstance[] = [
    ...(options.tv === false ? [] : [roomObject('tv', 'tvMeta', 0, good ? 1 : 2.8, Math.PI)]),
    ...(options.secondTv ? [roomObject('tv-2', 'tvMeta', 2, 2.8, Math.PI)] : []),
    roomObject('sofa', 'sofaMeta', 0, good ? -1.5 : -2.1, good ? 0 : Math.PI),
    ...(good ? [] : [
      roomObject('chair', 'chairMeta', -1.6, -.5, Math.PI / 2),
      roomObject('table', 'tableMeta', 0, -.9),
      roomObject('rug', 'rugMeta', 0, -1.3),
      roomObject('cabinet', 'cabinetMeta', 2.4, -2.5),
    ]),
  ];
  return {
    version: 1,
    room: { width: 6, depth: good ? 4.1 : 6, height: 2.7 },
    finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
    objects,
  };
};
