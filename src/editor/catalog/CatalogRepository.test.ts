import { describe, expect, it } from 'vitest';
import { parseRuntimeCatalog, RuntimeAssetRegistry } from '@/editor/assets/RuntimeAssetRegistry';
import { CatalogRepository, deriveDisplayName, mapDisplayCategory } from './CatalogRepository';

const record = (id: string, category: string) => ({ id, category, runtimeFilename: `runtime-assets/${id}.glb`, runtimeBytes: 1, triangleCount: 1, primitiveCount: 1, materialCount: 1, textureCount: 1, maxTextureDimension: 512, analyticalDecodedRGBABytes: 4, policyVersion: 1 });

describe('CatalogRepository', () => {
  it('keeps source and display taxonomy separate and preserves asset IDs', () => {
    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog([record('sofa_037', 'sofa'), record('wall_018', 'wall')]), '/runtime');
    const catalog = new CatalogRepository(registry, '/thumbs');
    expect(catalog.get('sofa_037')).toMatchObject({ assetId: 'sofa_037', sourceCategory: 'sofa', displayCategory: 'seating', displayName: 'Sofa 37', thumbnailUrl: '/thumbs/sofa_037.webp' });
    expect(catalog.get('wall_018').displayCategory).toBe('architecture');
  });

  it('groups, naturally sorts and filters visible items', () => {
    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog([record('chair_010', 'chair'), record('chair_002', 'chair'), record('lamp_048', 'lamp')]), '/runtime');
    const catalog = new CatalogRepository(registry, 'https://images.example/catalog');
    expect(catalog.itemsFor('seating').map((item) => item.assetId)).toEqual(['chair_002', 'chair_010']);
    expect(catalog.categories(new Set(['chair_010']))).toEqual(['seating']);
    expect(catalog.get('lamp_048').thumbnailUrl).toBe('https://images.example/catalog/lamp_048.webp');
  });

  it('derives names and rejects unmapped categories', () => {
    expect(deriveDisplayName('coffee_table_031')).toBe('Coffee Table 31');
    expect(mapDisplayCategory('bathroom')).toBe('kitchen-bath');
    expect(() => mapDisplayCategory('unknown')).toThrow('Unknown source category');
  });
});
