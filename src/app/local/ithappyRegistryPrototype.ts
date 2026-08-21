import { CollisionGroup, type FurnitureAssetDefinition } from '@/editor/model/types';
import { registerEphemeralAssets } from '@/editor/assets/registry';
import { parseRuntimeCatalog, RuntimeAssetRegistry } from '@/editor/assets/RuntimeAssetRegistry';

export const ITHAPPY_REGISTRY_BASE_URL = '/.local-assets/ithappy-registry/';
export const ITHAPPY_PROTOTYPE_IDS = ['sofa_037', 'chair_024', 'lamp_048'] as const;

const furnitureMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const decorMask = CollisionGroup.FURNITURE | CollisionGroup.DECOR;
const common = { placement: { anchor: 'floor' as const }, snapping: { grid: true, walls: true }, rotation: { enabled: true, stepDegrees: 45 } };
type PrototypeId = typeof ITHAPPY_PROTOTYPE_IDS[number];
type EditorMetadata = Omit<FurnitureAssetDefinition, 'id' | 'modelUrl' | 'placement' | 'snapping' | 'rotation'>;

const editorMetadata: Record<PrototypeId, EditorMetadata> = {
  sofa_037: {
    name: 'ITHappy Sofa 037', icon: '▰', category: 'sofas', dimensions: { width: 2.2994, height: 1.0765, depth: 1.3572 }, footprint: { width: 2.2994, depth: 1.3572 },
    collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: true }, variants: [{ id: 'source', color: '#ffffff' }], tags: ['local-prototype', 'ithappy'], semantic: { role: 'sofa' }, fallbackPrimitive: 'sofa',
  },
  chair_024: {
    name: 'ITHappy Chair 024', icon: '◫', category: 'chairs', dimensions: { width: 0.7319, height: 1.1372, depth: 0.7123 }, footprint: { width: 0.7319, depth: 0.7123 },
    collision: { group: CollisionGroup.FURNITURE, mask: furnitureMask }, normalization: { recenterToFootprint: true }, variants: [{ id: 'source', color: '#ffffff' }], tags: ['local-prototype', 'ithappy'], semantic: { role: 'armchair' }, fallbackPrimitive: 'chair',
  },
  lamp_048: {
    name: 'ITHappy Lamp 048', icon: '◉', category: 'lamps', dimensions: { width: 0.5142, height: 0.7893, depth: 0.6101 }, footprint: { width: 0.5142, depth: 0.6101 },
    collision: { group: CollisionGroup.DECOR, mask: decorMask }, interaction: { paddingXZ: 0.12 }, normalization: { recenterToFootprint: true }, variants: [{ id: 'source', color: '#ffffff' }], tags: ['local-prototype', 'ithappy'], semantic: { role: 'floorLamp' }, fallbackPrimitive: 'lamp',
  },
};

export const installIthappyRegistryPrototype = async () => {
  const response = await fetch(`${ITHAPPY_REGISTRY_BASE_URL}runtime-catalog.json`);
  if (!response.ok) throw new Error(`Could not load ITHappy runtime catalog: ${response.status}`);
  const registry = new RuntimeAssetRegistry(parseRuntimeCatalog(await response.json()), ITHAPPY_REGISTRY_BASE_URL);
  registerEphemeralAssets(ITHAPPY_PROTOTYPE_IDS.map((id) => ({ ...common, ...editorMetadata[id], id, modelUrl: registry.resolveAssetUrl(id) })));
  return registry;
};
