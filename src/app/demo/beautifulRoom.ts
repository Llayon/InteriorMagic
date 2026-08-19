import type { FurnitureInstance, RoomProject } from '@/editor/model/types';

const item = (instanceId: string, assetId: string, x: number, z: number, rotationY = 0): FurnitureInstance => ({ instanceId, assetId, position: { x, y: 0, z }, rotationY });

export const createBeautifulRoomProject = (): RoomProject => ({
  version: 1,
  room: { width: 4, depth: 5, height: 2.7 },
  finishes: { floorMaterialId: 'walnut', wallMaterialId: 'linen' },
  objects: [
    item('demo-rug', 'roundedRug', 0, -.55),
    item('demo-sofa', 'nordicSofa', 0, -1.9),
    item('demo-table', 'glassCoffeeTable', 0, -.75),
    item('demo-chair-left', 'relaxArmchair', -1.35, -.55, Math.PI / 4),
    item('demo-chair-right', 'nordicArmchair', 1.32, -.45, -Math.PI / 4),
    item('demo-lamp', 'roundFloorLamp', 1.72, -2.15),
    item('demo-palm', 'tallPottedPlant', -1.63, -2.08),
    item('demo-console', 'lowBookcase', -1.68, 1.62, Math.PI / 2),
    item('demo-plant', 'leafyPlant', 1.62, 1.72),
  ],
});
