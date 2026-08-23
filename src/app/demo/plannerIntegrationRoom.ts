import { registerEphemeralAssets } from '@/editor/assets/registry';
import type { FurnitureAssetDefinition, FurnitureInstance, RoomProject } from '@/editor/model/types';

export type PlannerIntegrationRoomId = 'improved' | 'already-good' | 'no-tv';

const testTv: FurnitureAssetDefinition = {
  id: 'plannerTestTv', name: 'Test TV', icon: '▰', category: 'tables',
  dimensions: { width: 1.2, height: .7, depth: .1 }, footprint: { width: 1.2, depth: .1 },
  placement: { anchor: 'wall' }, collision: { group: 0, mask: 0 },
  snapping: { grid: false, walls: true }, rotation: { enabled: false, stepDegrees: 45 },
  variants: [{ id: 'test', color: '#222222' }], tags: ['test-only'], semantic: { role: 'tv' }, fallbackPrimitive: 'table',
};

export const installPlannerIntegrationTestAssets = () => {
  try { registerEphemeralAssets([testTv]); } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes('already registered')) throw cause;
  }
};

const item = (instanceId: string, assetId: string, x: number, z: number, rotationY = 0): FurnitureInstance => ({
  instanceId, assetId, position: { x, y: 0, z }, rotationY,
});

export const createPlannerIntegrationProject = (id: PlannerIntegrationRoomId): RoomProject => {
  if (id === 'already-good') return {
    version: 1, room: { width: 6, depth: 4.1, height: 2.7 }, finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
    objects: [item('test-tv', 'plannerTestTv', 0, 1, Math.PI), item('test-sofa', 'nordicSofa', 0, -1.58, 0)],
  };
  const objects = [
    ...(id === 'no-tv' ? [] : [item('test-tv', 'plannerTestTv', 0, 2.8, Math.PI)]),
    item('test-sofa', 'nordicSofa', 0, -2.1, Math.PI),
    item('test-chair', 'relaxArmchair', -1.6, -.5, Math.PI / 2),
    item('test-table', 'glassCoffeeTable', 0, -.9, 0),
    item('test-rug', 'roundedRug', 0, -1.3, 0),
    item('test-plant', 'tallPottedPlant', 2.5, -2.3, 0),
  ];
  return {
    version: 1, room: { width: 6, depth: 6, height: 2.7 }, finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' }, objects,
  };
};
