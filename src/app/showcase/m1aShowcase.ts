import { CollisionGroup, type FurnitureAssetDefinition, type RoomProject } from '@/editor/model/types';
import { registerEphemeralAssets } from '@/editor/assets/registry';
import { RuntimeAssetRegistry, type RuntimeCatalogEntry } from '@/editor/assets/RuntimeAssetRegistry';
import { CatalogRepository, configureCatalogRepository, parseCatalogPayload, type CatalogPayloadEntry, type DisplayCategory } from '@/editor/catalog/CatalogRepository';
import { assetCache } from '@/scene/assets/AssetCache';
import { useEditorStore } from '@/editor/state/store';
import selection from '@/editor/catalog/data/production-catalog-v1.json';
import facts from '@/editor/catalog/data/production-asset-facts-v1.json';
import evidence from '@/editor/catalog/data/production-asset-spatial-evidence-v1.json';
import type { FurnitureSemanticRole, PlacementAnchor } from '@/editor/model/types';

export const M1A_SELECTED_IDS = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'] as const;
export const M1A_CATALOG_IDS = ['chair', 'carpet', 'dresser_001', 'lamp'] as const;
export const M1A_SEED_MODEL_IDS = M1A_SELECTED_IDS;

const furnitureMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const decorMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const common = { snapping: { grid: true, walls: true }, rotation: { enabled: true, stepDegrees: 45 } };

// These are the frozen K1 Facts dimensions and footprints. Presentation fields
// below are explicit M1A decisions; none are inferred from source taxonomy.
type ShowcasePolicy = Omit<FurnitureAssetDefinition, 'dimensions' | 'footprint' | 'placement' | 'semantic'>;
const policies: Record<(typeof M1A_SELECTED_IDS)[number], ShowcasePolicy> = {
  carpet: { ...common, id: 'carpet', name: 'Carpet', icon: '▧', modelUrl: '/__m1a_assets__/models/carpet.glb', thumbnailUrl: '/__m1a_assets__/thumbs/carpet.png', collision: { group: CollisionGroup.RUG, mask: CollisionGroup.RUG }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#c5b69b' }], category: 'rugs', tags: ['m1a', 'canonical'], fallbackPrimitive: 'rug' },
  chair: { ...common, id: 'chair', name: 'Chair', icon: '◫', modelUrl: '/__m1a_assets__/models/chair.glb', thumbnailUrl: '/__m1a_assets__/thumbs/chair.png', collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#b77b5d' }], category: 'chairs', tags: ['m1a', 'canonical'], fallbackPrimitive: 'chair' },
  coffee_table_026: { ...common, id: 'coffee_table_026', name: 'Coffee Table 26', icon: '▰', modelUrl: '/__m1a_assets__/models/coffee_table_026.glb', thumbnailUrl: '/__m1a_assets__/thumbs/coffee_table_026.png', collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#9d7658' }], category: 'tables', tags: ['m1a', 'canonical'], fallbackPrimitive: 'table' },
  dresser_001: { ...common, id: 'dresser_001', name: 'Dresser 1', icon: '▣', modelUrl: '/__m1a_assets__/models/dresser_001.glb', thumbnailUrl: '/__m1a_assets__/thumbs/dresser_001.png', collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#8d6b4d' }], category: 'tables', tags: ['m1a', 'canonical'], fallbackPrimitive: 'table' },
  electronics: { ...common, id: 'electronics', name: 'TV', icon: '▭', modelUrl: '/__m1a_assets__/models/electronics.glb', thumbnailUrl: '/__m1a_assets__/thumbs/electronics.png', collision: { group: 0, mask: 0 }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#232323' }], category: 'tables', tags: ['m1a', 'fixed-wall-focal'], fallbackPrimitive: 'table' },
  lamp: { ...common, id: 'lamp', name: 'Floor Lamp', icon: '◉', modelUrl: '/__m1a_assets__/models/lamp.glb', thumbnailUrl: '/__m1a_assets__/thumbs/lamp.png', collision: { group: CollisionGroup.DECOR, mask: decorMask }, interaction: { paddingXZ: 0.12 }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#b69358' }], category: 'lamps', tags: ['m1a', 'canonical'], fallbackPrimitive: 'lamp' },
  sofa_030: { ...common, id: 'sofa_030', name: 'Sofa 30', icon: '▰', modelUrl: '/__m1a_assets__/models/sofa_030.glb', thumbnailUrl: '/__m1a_assets__/thumbs/sofa_030.png', collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: false }, variants: [{ id: 'canonical', color: '#65736c' }], category: 'sofas', tags: ['m1a', 'canonical'], fallbackPrimitive: 'sofa' },
};

export type AuthorityInput = { selection: typeof selection; facts: typeof facts; evidence: typeof evidence };
export const resolveM1AAsset = (assetId: string, authority: AuthorityInput = { selection, facts, evidence }): FurnitureAssetDefinition => {
  if (!(M1A_SELECTED_IDS as readonly string[]).includes(assetId)) throw new Error(`M1A asset is not selected: ${assetId}`);
  const selected = authority.selection.assets.filter((row) => row.assetId === assetId);
  const factual = authority.facts.assets.filter((row) => row.assetId === assetId);
  const attested = authority.evidence.entries.filter((row) => row.assetId === assetId);
  if (selected.length !== 1 || factual.length !== 1 || attested.length !== 1) throw new Error(`M1A authority cardinality failure: ${assetId}`);
  const selectionRow = selected[0]!, factsRow = factual[0]!, evidenceRow = attested[0]!;
  const dimensions = factsRow.dimensions, footprint = factsRow.footprint;
  if (evidenceRow.semanticMismatch !== false || evidenceRow.canonicalVisualQa !== 'pass' || factsRow.placement.status !== 'resolved') throw new Error(`M1A authority verdict failure: ${assetId}`);
  if (![dimensions.width, dimensions.height, dimensions.depth, footprint.width, footprint.depth].every((value) => Number.isFinite(value) && value > 0)) throw new Error(`M1A authority geometry failure: ${assetId}`);
  if (!factsRow.placement.anchor) throw new Error(`M1A authority anchor failure: ${assetId}`);
  if ((M1A_CATALOG_IDS as readonly string[]).includes(assetId) && (factsRow.placement.anchor !== 'floor' || factsRow.placement.editorPlacementSupport !== 'supported')) throw new Error(`M1A catalog placement failure: ${assetId}`);
  if (assetId === 'electronics' && (assetId !== 'electronics' || selectionRow.semanticRole !== 'tv' || factsRow.placement.anchor !== 'wall' || factsRow.placement.editorPlacementSupport !== 'unsupported')) throw new Error('M1A TV authority failure');
  const policy = policies[assetId as keyof typeof policies];
  return { ...policy, dimensions: { ...dimensions }, footprint: { width: footprint.width, depth: footprint.depth }, placement: { anchor: factsRow.placement.anchor as PlacementAnchor }, semantic: { role: selectionRow.semanticRole as FurnitureSemanticRole } };
};
const definitions = Object.fromEntries(M1A_SELECTED_IDS.map((id) => [id, resolveM1AAsset(id)])) as Record<(typeof M1A_SELECTED_IDS)[number], FurnitureAssetDefinition>;

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
  // Tuned only after the real K1-sized assets produced no useful
  // Conversation candidate with the original visual placement.
  { instanceId: 'showcase-sofa', assetId: 'sofa_030', position: { x: 2.0187060322612527, y: 0, z: -0.10532019697129735 }, rotationY: -1.7903640423630027 },
  { instanceId: 'showcase-chair-left', assetId: 'chair', position: { x: -1.654823091533035, y: 0, z: -1.0881974458694457 }, rotationY: 2.7221120578877978 },
  { instanceId: 'showcase-chair-right', assetId: 'chair', position: { x: 0.18200833294540653, y: 0, z: 1.3365686874836684 }, rotationY: 1.4761035179107473 },
  { instanceId: 'showcase-table', assetId: 'coffee_table_026', position: { x: -1.481598057691008, y: 0, z: 1.3113003082573411 }, rotationY: -1.4677411955844668 },
  { instanceId: 'showcase-console', assetId: 'dresser_001', position: { x: 0.42395460084080705, y: 0, z: -2.3450603049248455 }, rotationY: -3.103538188275347 },
  { instanceId: 'showcase-lamp', assetId: 'lamp', position: { x: -0.28129944233223814, y: 0, z: 0.06766651421785363 }, rotationY: 2.2746501885848716 },
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
