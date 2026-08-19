import { CollisionGroup, type FurnitureAssetDefinition } from '@/editor/model/types';

const FURNITURE_MASK = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const DECOR_MASK = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const define = (asset: FurnitureAssetDefinition) => asset;
const common = {
  placement: { anchor: 'floor' as const },
  snapping: { grid: true, walls: true },
  rotation: { enabled: true, stepDegrees: 45 },
};

export const furnitureAssets = {
  sofa: define({
    ...common, id: 'sofa', name: 'Диван', icon: '▰', category: 'sofas',
    modelUrl: 'models/ugly_sofa.glb', thumbnailUrl: 'thumbnails/sofa.svg',
    dimensions: { width: 2.05, height: 0.96, depth: 0.85 }, footprint: { width: 2.05, depth: 0.85 },
    collision: { group: CollisionGroup.FURNITURE, mask: FURNITURE_MASK },
    normalization: { scale: 100, rotationEuler: { x: 0, y: -Math.PI / 2, z: 0 }, recenterToFootprint: true },
    variants: [
      { id: 'sage', color: '#758878', materialOverrides: { upholstery: { color: '#758878' } } },
      { id: 'sand', color: '#b58d6a', materialOverrides: { upholstery: { color: '#b58d6a' } } },
      { id: 'ink', color: '#4c5664', materialOverrides: { upholstery: { color: '#4c5664' } } },
    ], tags: ['seating', 'large'], fallbackPrimitive: 'sofa',
  }),
  chair: define({
    ...common, id: 'chair', name: 'Кресло', icon: '◫', category: 'chairs',
    modelUrl: 'models/chair.glb', thumbnailUrl: 'thumbnails/chair.svg',
    dimensions: { width: 0.72, height: 1.08, depth: 0.76 }, footprint: { width: 0.72, depth: 0.76 },
    collision: { group: CollisionGroup.FURNITURE, mask: FURNITURE_MASK },
    variants: [
      { id: 'clay', color: '#bf765f', materialOverrides: { upholstery: { color: '#bf765f' } } },
      { id: 'cream', color: '#d5c5a8', materialOverrides: { upholstery: { color: '#d5c5a8' } } },
    ], tags: ['seating'], fallbackPrimitive: 'chair',
  }),
  sheenChair: define({
    ...common, id: 'sheenChair', name: 'Бархатное кресло', icon: '◫', category: 'chairs',
    modelUrl: 'models/sheen_chair.glb', thumbnailUrl: 'thumbnails/sheen_chair.jpg',
    dimensions: { width: 0.827, height: 0.687, depth: 0.571 }, footprint: { width: 0.84, depth: 0.59 },
    collision: { group: CollisionGroup.FURNITURE, mask: FURNITURE_MASK }, interaction: { paddingXZ: 0.08, minHeight: 0.55 },
    normalization: { recenterToFootprint: true },
    variants: [
      { id: 'mango', color: '#b86f3e' },
      { id: 'peacock', color: '#346b72', materialOverrides: { 'fabric Mystere Mango Velvet': { color: '#4f9298' } } },
    ], tags: ['seating', 'external', 'textured', 'cc0'], fallbackPrimitive: 'chair',
  }),
  table: define({
    ...common, id: 'table', name: 'Стол', icon: '▬', category: 'tables',
    modelUrl: 'models/table.glb', thumbnailUrl: 'thumbnails/table.svg',
    dimensions: { width: 1.35, height: 0.76, depth: 0.78 }, footprint: { width: 1.35, depth: 0.78 },
    collision: { group: CollisionGroup.FURNITURE, mask: FURNITURE_MASK },
    variants: [
      { id: 'walnut', color: '#78533b', materialOverrides: { wood: { color: '#78533b' } } },
      { id: 'oak', color: '#b18b61', materialOverrides: { wood: { color: '#b18b61' } } },
    ], tags: ['surface'], fallbackPrimitive: 'table',
  }),
  plant: define({
    ...common, id: 'plant', name: 'Фикус', icon: '♣', category: 'plants',
    modelUrl: 'models/plant.glb', thumbnailUrl: 'thumbnails/plant.svg',
    dimensions: { width: 0.58, height: 1.35, depth: 0.58 }, footprint: { width: 0.58, depth: 0.58 },
    collision: { group: CollisionGroup.DECOR, mask: DECOR_MASK }, interaction: { paddingXZ: 0.12 },
    variants: [
      { id: 'green', color: '#66865d', materialOverrides: { foliage: { color: '#66865d' } } },
      { id: 'dark', color: '#3e624a', materialOverrides: { foliage: { color: '#3e624a' } } },
    ], tags: ['decor', 'nature'], fallbackPrimitive: 'plant',
  }),
  rug: define({
    ...common, id: 'rug', name: 'Ковёр', icon: '▧', category: 'rugs',
    modelUrl: 'models/rug.glb', thumbnailUrl: 'thumbnails/rug.svg',
    dimensions: { width: 2.2, height: 0.025, depth: 1.6 }, footprint: { width: 2.2, depth: 1.6 },
    collision: { group: CollisionGroup.RUG, mask: CollisionGroup.RUG }, interaction: { minHeight: 0.18 },
    variants: [
      { id: 'rust', color: '#a7634d', materialOverrides: { rug_fabric: { color: '#a7634d' } } },
      { id: 'oat', color: '#c7b99c', materialOverrides: { rug_fabric: { color: '#c7b99c' } } },
    ], tags: ['textile'], fallbackPrimitive: 'rug',
  }),
  lamp: define({
    ...common, id: 'lamp', name: 'Торшер', icon: '◉', category: 'lamps',
    dimensions: { width: 0.48, height: 1.65, depth: 0.48 }, footprint: { width: 0.48, depth: 0.48 },
    collision: { group: CollisionGroup.DECOR, mask: DECOR_MASK }, interaction: { paddingXZ: 0.12 },
    variants: [{ id: 'brass', color: '#b69358' }, { id: 'graphite', color: '#55585c' }],
    tags: ['decor', 'lighting'], fallbackPrimitive: 'lamp',
  }),
} as const;

export type AssetId = keyof typeof furnitureAssets;
export const assetList: FurnitureAssetDefinition[] = Object.values(furnitureAssets);
export const getAsset = (id: string): FurnitureAssetDefinition => {
  const asset = (furnitureAssets as Record<string, FurnitureAssetDefinition>)[id];
  if (!asset) throw new Error(`Unknown asset: ${id}`);
  return asset;
};
