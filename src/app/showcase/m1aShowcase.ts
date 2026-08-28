import { CollisionGroup, type FurnitureAssetDefinition, type RoomProject } from '@/editor/model/types';
import { registerEphemeralAssets } from '@/editor/assets/registry';
import { RuntimeAssetRegistry, type RuntimeCatalogEntry } from '@/editor/assets/RuntimeAssetRegistry';
import { CatalogRepository, configureCatalogRepository, parseCatalogPayload, type CatalogPayloadEntry, type DisplayCategory } from '@/editor/catalog/CatalogRepository';
import { assetCache } from '@/scene/assets/AssetCache';
import { useEditorStore } from '@/editor/state/store';

export const M1A_SELECTED_IDS = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'] as const;
export const M1A_CATALOG_IDS = ['chair', 'carpet', 'dresser_001', 'lamp'] as const;
export const M1A_SEED_MODEL_IDS = M1A_SELECTED_IDS;

const furnitureMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const decorMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const common = { placement: { anchor: 'floor' as const }, snapping: { grid: true, walls: true }, rotation: { enabled: true, stepDegrees: 45 } };

// These are the frozen K1 Facts dimensions and footprints. Presentation fields
// below are explicit M1A decisions; none are inferred from source taxonomy.
const definitions: Record<(typeof M1A_SELECTED_IDS)[number], FurnitureAssetDefinition> = {
  carpet: { ...common, id: 'carpet', name: 'Carpet', icon: '▧', modelUrl: '/__m1a_assets__/models/carpet.glb', thumbnailUrl: '/__m1a_assets__/thumbs/carpet.png', dimensions: { width: 2.636662244796753, height: 0.06988438684493303, depth: 3.676490306854248 }, footprint: { width: 2.636662244796753, depth: 3.676490306854248 }, collision: { group: CollisionGroup.RUG, mask: CollisionGroup.RUG }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#c5b69b' }], category: 'rugs', tags: ['m1a', 'canonical'], semantic: { role: 'rug' }, fallbackPrimitive: 'rug' },
  chair: { ...common, id: 'chair', name: 'Chair', icon: '◫', modelUrl: '/__m1a_assets__/models/chair.glb', thumbnailUrl: '/__m1a_assets__/thumbs/chair.png', dimensions: { width: 1.583863079547882, height: 0.9710300213423579, depth: 1.2947130799293518 }, footprint: { width: 1.583863079547882, depth: 1.2947130799293518 }, collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#b77b5d' }], category: 'chairs', tags: ['m1a', 'canonical'], semantic: { role: 'armchair' }, fallbackPrimitive: 'chair' },
  coffee_table_026: { ...common, id: 'coffee_table_026', name: 'Coffee Table 26', icon: '▰', modelUrl: '/__m1a_assets__/models/coffee_table_026.glb', thumbnailUrl: '/__m1a_assets__/thumbs/coffee_table_026.png', dimensions: { width: 1.2360719442367554, height: 0.6043793305008975, depth: 1.2360713481903076 }, footprint: { width: 1.2360719442367554, depth: 1.2360713481903076 }, collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#9d7658' }], category: 'tables', tags: ['m1a', 'canonical'], semantic: { role: 'coffeeTable' }, fallbackPrimitive: 'table' },
  dresser_001: { ...common, id: 'dresser_001', name: 'Dresser 1', icon: '▣', modelUrl: '/__m1a_assets__/models/dresser_001.glb', thumbnailUrl: '/__m1a_assets__/thumbs/dresser_001.png', dimensions: { width: 2.279863119125366, height: 0.746204614762064, depth: 0.7706019580364227 }, footprint: { width: 2.279863119125366, depth: 0.7706019580364227 }, collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#8d6b4d' }], category: 'tables', tags: ['m1a', 'canonical'], semantic: { role: 'console' }, fallbackPrimitive: 'table' },
  electronics: { ...common, id: 'electronics', name: 'TV', icon: '▭', modelUrl: '/__m1a_assets__/models/electronics.glb', thumbnailUrl: '/__m1a_assets__/thumbs/electronics.png', dimensions: { width: 1.6128783822059631, height: 0.8985914587974548, depth: 0.08700115606188774 }, footprint: { width: 1.6128783822059631, depth: 0.08700115606188774 }, placement: { anchor: 'wall' }, collision: { group: 0, mask: 0 }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#232323' }], category: 'tables', tags: ['m1a', 'fixed-wall-focal'], semantic: { role: 'tv' }, fallbackPrimitive: 'table' },
  lamp: { ...common, id: 'lamp', name: 'Floor Lamp', icon: '◉', modelUrl: '/__m1a_assets__/models/lamp.glb', thumbnailUrl: '/__m1a_assets__/thumbs/lamp.png', dimensions: { width: 0.45082788169384, height: 2.2121968636594076, depth: 0.45082709193229675 }, footprint: { width: 0.45082788169384, depth: 0.45082709193229675 }, collision: { group: CollisionGroup.DECOR, mask: decorMask }, interaction: { paddingXZ: 0.12 }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#b69358' }], category: 'lamps', tags: ['m1a', 'canonical'], semantic: { role: 'floorLamp' }, fallbackPrimitive: 'lamp' },
  sofa_030: { ...common, id: 'sofa_030', name: 'Sofa 30', icon: '▰', modelUrl: '/__m1a_assets__/models/sofa_030.glb', thumbnailUrl: '/__m1a_assets__/thumbs/sofa_030.png', dimensions: { width: 2.7708131074905396, height: 1.2313083540959724, depth: 1.4960343837738037 }, footprint: { width: 2.7708131074905396, depth: 1.4960343837738037 }, collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#65736c' }], category: 'sofas', tags: ['m1a', 'canonical'], semantic: { role: 'sofa' }, fallbackPrimitive: 'sofa' },
};

const runtimeNumbers: Record<string, Omit<RuntimeCatalogEntry, 'id' | 'runtimeFilename' | 'category'>> = {
  carpet: { runtimeBytes: 173560, triangleCount: 321, primitiveCount: 2, materialCount: 2, textureCount: 3, maxTextureDimension: 512, analyticalDecodedRGBABytes: 3145728, policyVersion: 1 },
  chair: { runtimeBytes: 654096, triangleCount: 516, primitiveCount: 4, materialCount: 4, textureCount: 6, maxTextureDimension: 512, analyticalDecodedRGBABytes: 6291456, policyVersion: 1 },
  coffee_table_026: { runtimeBytes: 230008, triangleCount: 194, primitiveCount: 1, materialCount: 1, textureCount: 2, maxTextureDimension: 512, analyticalDecodedRGBABytes: 2097152, policyVersion: 1 },
  dresser_001: { runtimeBytes: 236988, triangleCount: 272, primitiveCount: 1, materialCount: 1, textureCount: 2, maxTextureDimension: 512, analyticalDecodedRGBABytes: 2097152, policyVersion: 1 },
  electronics: { runtimeBytes: 6892, triangleCount: 60, primitiveCount: 2, materialCount: 2, textureCount: 1, maxTextureDimension: 512, analyticalDecodedRGBABytes: 1048576, policyVersion: 1 },
  lamp: { runtimeBytes: 211400, triangleCount: 862, primitiveCount: 4, materialCount: 4, textureCount: 4, maxTextureDimension: 512, analyticalDecodedRGBABytes: 4194304, policyVersion: 1 },
  sofa_030: { runtimeBytes: 212488, triangleCount: 238, primitiveCount: 2, materialCount: 2, textureCount: 3, maxTextureDimension: 512, analyticalDecodedRGBABytes: 3145728, policyVersion: 1 },
};
const sourceCategories: Record<string, string> = { carpet: 'carpet', chair: 'chair', coffee_table_026: 'coffee', dresser_001: 'dresser', electronics: 'electronics', lamp: 'lamp', sofa_030: 'sofa' };
const displayCategories: Record<string, DisplayCategory> = { chair: 'seating', carpet: 'decor', dresser_001: 'storage', lamp: 'lighting', coffee_table_026: 'tables', electronics: 'decor', sofa_030: 'seating' };

export const createM1ARuntimeRegistry = () => new RuntimeAssetRegistry(M1A_SELECTED_IDS.map((id) => ({ id, runtimeFilename: `models/${id}.glb`, category: sourceCategories[id]!, ...runtimeNumbers[id]! })), '/__m1a_assets__/');
export const createM1ACatalogRepository = () => {
  const registry = createM1ARuntimeRegistry();
  const payload: CatalogPayloadEntry[] = M1A_SELECTED_IDS.map((assetId) => ({ assetId, sourceCategory: sourceCategories[assetId]!, displayCategory: ({ seating: 'Seating', decor: 'Decor', storage: 'Storage', lighting: 'Lighting', tables: 'Tables' } as Record<string, string>)[displayCategories[assetId]!]!, displayName: definitions[assetId]!.name, thumbnailFilename: `thumbs/${assetId}.png`, runtimeFilename: `models/${assetId}.glb`, ...runtimeNumbers[assetId]! }));
  return new CatalogRepository(registry, parseCatalogPayload(payload), '/__m1a_assets__/');
};

export const createM1AShowcaseProject = (): RoomProject => ({ version: 1, room: { width: 6.2, depth: 5.8, height: 2.7 }, finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' }, objects: [
  { instanceId: 'showcase-rug', assetId: 'carpet', position: { x: 0, y: 0, z: -0.20 }, rotationY: 0 },
  { instanceId: 'showcase-sofa', assetId: 'sofa_030', position: { x: 0, y: 0, z: -1.68 }, rotationY: 0.32 },
  { instanceId: 'showcase-chair-left', assetId: 'chair', position: { x: -2, y: 0, z: 0.65 }, rotationY: 2.57 },
  { instanceId: 'showcase-chair-right', assetId: 'chair', position: { x: 2, y: 0, z: 0.65 }, rotationY: -2.57 },
  { instanceId: 'showcase-table', assetId: 'coffee_table_026', position: { x: 0.25, y: 0, z: 0.15 }, rotationY: 0.10 },
  { instanceId: 'showcase-console', assetId: 'dresser_001', position: { x: 0, y: 0, z: 2.45 }, rotationY: 0 },
  { instanceId: 'showcase-lamp', assetId: 'lamp', position: { x: 2.50, y: 0, z: 1.20 }, rotationY: 0 },
  { instanceId: 'showcase-tv', assetId: 'electronics', position: { x: 0, y: 1.15, z: 2.84 }, rotationY: Math.PI },
] });

export const installM1AShowcase = async () => {
  registerEphemeralAssets(Object.values(definitions), { overrideExisting: true });
  const catalog = createM1ACatalogRepository();
  configureCatalogRepository(catalog, { visibleIds: M1A_CATALOG_IDS, placementEnabledCategories: ['seating', 'storage', 'lighting', 'decor'] });
  useEditorStore.setState({ project: createM1AShowcaseProject(), session: { ...useEditorStore.getState().session, catalogCategory: 'seating' } });
  await Promise.all(M1A_SEED_MODEL_IDS.map((id) => assetCache.load(definitions[id])));
};

export const getM1AAssetDefinition = (assetId: string) => definitions[assetId as keyof typeof definitions];
