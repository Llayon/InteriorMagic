import { CollisionGroup, type FurnitureAssetDefinition, type FurnitureSemanticRole } from '@/editor/model/types';
import { registerEphemeralAssets } from '@/editor/assets/registry';
import { parseRuntimeCatalog, RuntimeAssetRegistry } from '@/editor/assets/RuntimeAssetRegistry';
import { CatalogRepository, configureCatalogRepository, parseCatalogPayload, type CatalogItem, type DisplayCategory } from '@/editor/catalog/CatalogRepository';
import { useEditorStore } from '@/editor/state/store';

export const ITHAPPY_REGISTRY_BASE_URL = '/.local-assets/ithappy-registry/';
export const ITHAPPY_PLACEMENT_ENABLED_CATEGORIES: DisplayCategory[] = ['seating', 'tables', 'storage', 'lighting', 'plants', 'decor'];

export const normalizeRemoteAssetOrigin = (value: string) => {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) throw new Error('Remote ITHappy asset origin must use HTTPS outside loopback development');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '') + '/';
};

// Raw scene bounds exist only to exercise the local add flow and frame offline thumbnails.
// They are not authoritative asset-contract dimensions, footprints, or production placement metadata.
type PrototypePlacementDocument = { provenance: 'prototype-raw-scene-bounds-not-production-metadata'; assets: Record<string, { dimensions: { width: number; height: number; depth: number } }> };
const furnitureMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const decorMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const common = { placement: { anchor: 'floor' as const }, snapping: { grid: true, walls: true }, rotation: { enabled: true, stepDegrees: 45 } };

const behaviorFor = (item: CatalogItem): { category: FurnitureAssetDefinition['category']; role: FurnitureSemanticRole; group: number; mask: number; fallback: FurnitureAssetDefinition['fallbackPrimitive']; interaction?: FurnitureAssetDefinition['interaction'] } => {
  if (item.sourceCategory === 'sofa') return { category: 'sofas', role: 'sofa', group: CollisionGroup.FURNITURE, mask: furnitureMask, fallback: 'sofa' };
  if (item.sourceCategory === 'chair') return { category: 'chairs', role: 'armchair', group: CollisionGroup.FURNITURE, mask: furnitureMask, fallback: 'chair' };
  if (item.sourceCategory === 'coffee' || item.sourceCategory === 'work') return { category: 'tables', role: 'coffeeTable', group: CollisionGroup.FURNITURE, mask: furnitureMask, fallback: 'table' };
  if (['cupboard', 'dresser', 'shelf', 'entertainment'].includes(item.sourceCategory)) return { category: 'tables', role: 'console', group: CollisionGroup.FURNITURE, mask: furnitureMask, fallback: 'table' };
  if (item.sourceCategory === 'lamp') return { category: 'lamps', role: 'floorLamp', group: CollisionGroup.DECOR, mask: decorMask, fallback: 'lamp', interaction: { paddingXZ: .12 } };
  if (item.sourceCategory === 'flower') return { category: 'plants', role: 'plant', group: CollisionGroup.DECOR, mask: decorMask, fallback: 'plant', interaction: { paddingXZ: .12 } };
  if (item.sourceCategory === 'carpet') return { category: 'rugs', role: 'rug', group: CollisionGroup.RUG, mask: CollisionGroup.RUG, fallback: 'rug', interaction: { minHeight: .18 } };
  return { category: 'plants', role: 'floorDecor', group: CollisionGroup.DECOR, mask: decorMask, fallback: 'plant', interaction: { paddingXZ: .1 } };
};

const parsePlacementDocument = (value: unknown, requiredIds: readonly string[]): PrototypePlacementDocument => {
  if (!value || typeof value !== 'object') throw new Error('Invalid prototype placement metadata');
  const document = value as PrototypePlacementDocument;
  if (document.provenance !== 'prototype-raw-scene-bounds-not-production-metadata' || !document.assets) throw new Error('Invalid prototype placement metadata provenance');
  for (const id of requiredIds) {
    const dimensions = document.assets[id]?.dimensions;
    if (!dimensions || ![dimensions.width, dimensions.height, dimensions.depth].every((number) => Number.isFinite(number) && number > 0)) throw new Error(`Missing prototype placement metadata: ${id}`);
  }
  return document;
};

const installCatalog = async (assetOrigin: string, placementMetadataUrl: string) => {
  const [runtimeResponse, payloadResponse, placementResponse] = await Promise.all([
    fetch(`${assetOrigin}runtime-catalog.json`),
    fetch(`${assetOrigin}catalog-payload.json`),
    fetch(placementMetadataUrl),
  ]);
  if (!runtimeResponse.ok) throw new Error(`Could not load ITHappy runtime catalog: ${runtimeResponse.status}`);
  if (!payloadResponse.ok) throw new Error(`Could not load ITHappy catalog payload: ${payloadResponse.status}`);
  if (!placementResponse.ok) throw new Error(`Could not load prototype placement metadata: ${placementResponse.status}`);
  const registry = new RuntimeAssetRegistry(parseRuntimeCatalog(await runtimeResponse.json()), assetOrigin);
  const catalog = new CatalogRepository(registry, parseCatalogPayload(await payloadResponse.json()), assetOrigin);
  const placementEnabled = new Set(ITHAPPY_PLACEMENT_ENABLED_CATEGORIES);
  const placementIds = catalog.list().filter((item) => placementEnabled.has(item.displayCategory)).map((item) => item.assetId);
  const placement = parsePlacementDocument(await placementResponse.json(), placementIds);
  registerEphemeralAssets(placementIds.map((id): FurnitureAssetDefinition => {
    const item = catalog.get(id), behavior = behaviorFor(item), dimensions = placement.assets[id]!.dimensions;
    return {
      ...common, id, name: item.displayName, icon: '●', category: behavior.category, modelUrl: registry.resolveAssetUrl(id),
      dimensions, footprint: { width: dimensions.width, depth: dimensions.depth }, collision: { group: behavior.group, mask: behavior.mask }, interaction: behavior.interaction,
      normalization: { recenterToFootprint: true }, variants: [{ id: 'source', color: '#ffffff' }], tags: ['local-catalog-prototype', 'ithappy'], semantic: { role: behavior.role }, fallbackPrimitive: behavior.fallback,
    };
  }), { overrideExisting: true });
  configureCatalogRepository(catalog, { placementEnabledCategories: ITHAPPY_PLACEMENT_ENABLED_CATEGORIES });
  useEditorStore.setState((state) => ({ session: { ...state.session, catalogCategory: 'seating' } }));
  return { registry, catalog };
};

export const installIthappyRegistryPrototype = () => installCatalog(ITHAPPY_REGISTRY_BASE_URL, `${ITHAPPY_REGISTRY_BASE_URL}prototype-placement.json`);

export const installIthappyRemoteRegistryPrototype = (assetOrigin: string) =>
  installCatalog(normalizeRemoteAssetOrigin(assetOrigin), `${ITHAPPY_REGISTRY_BASE_URL}prototype-placement.json`);
