export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };
export type Category = 'sofas' | 'chairs' | 'tables' | 'plants' | 'lamps' | 'rugs';
export type PlacementAnchor = 'floor' | 'wall' | 'surface' | 'ceiling';
export type FurnitureSemanticRole = 'tv' | 'sofa' | 'armchair' | 'coffeeTable' | 'sideTable' | 'console' | 'rug' | 'floorLamp' | 'plant' | 'floorDecor';

export const CollisionGroup = {
  FURNITURE: 1 << 0,
  RUG: 1 << 1,
  DECOR: 1 << 2,
} as const;

export interface FurnitureInstance {
  instanceId: string;
  assetId: string;
  position: Vec3;
  rotationY: number;
  variantId?: string;
}

export interface RoomProject {
  version: 1;
  room: { width: number; depth: number; height: number };
  finishes: { floorMaterialId: string; wallMaterialId: string };
  objects: FurnitureInstance[];
}

export interface FurnitureVariant {
  id: string;
  color: string;
  materialOverrides?: Record<string, { color: string }>;
}

export interface FurnitureAssetDefinition {
  id: string;
  name: string;
  icon: string;
  modelUrl?: string;
  thumbnailUrl?: string;
  dimensions: { width: number; height: number; depth: number };
  footprint: { width: number; depth: number };
  placement: { anchor: PlacementAnchor };
  collision: { group: number; mask: number };
  snapping: { grid: boolean; walls: boolean };
  rotation: { enabled: boolean; stepDegrees: number };
  interaction?: { paddingXZ?: number; minHeight?: number };
  normalization?: {
    scale?: number | Vec3;
    rotationEuler?: Vec3;
    translation?: Vec3;
    recenterToFootprint?: boolean;
  };
  variants: FurnitureVariant[];
  category: Category;
  tags: string[];
  semantic?: { role: FurnitureSemanticRole };
  fallbackPrimitive: 'sofa' | 'chair' | 'table' | 'plant' | 'lamp' | 'rug';
}

export const createDefaultProject = (): RoomProject => ({
  version: 1,
  room: { width: 4, depth: 5, height: 2.7 },
  finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
  objects: [],
});

export const cloneProject = (project: RoomProject): RoomProject => structuredClone(project);
