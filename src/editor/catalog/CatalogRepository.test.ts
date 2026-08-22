import { describe, expect, it } from 'vitest';
import { parseRuntimeCatalog, RuntimeAssetRegistry } from '@/editor/assets/RuntimeAssetRegistry';
import { CatalogRepository, deriveDisplayName, mapDisplayCategory, parseCatalogPayload } from './CatalogRepository';

const record = (id: string, category: string, runtimeBytes = 1) => ({ id, category, runtimeFilename: `runtime-assets/${id}.glb`, runtimeBytes, triangleCount: 1, primitiveCount: 1, materialCount: 1, textureCount: 1, maxTextureDimension: 512, analyticalDecodedRGBABytes: 4, policyVersion: 1 });
const displayLabel = (category: string) => ({ sofa: 'Seating', chair: 'Seating', lamp: 'Lighting', wall: 'Architecture' })[category] ?? 'Decor';
const payload = (id: string, category: string, runtimeBytes = 1) => ({ assetId: id, sourceCategory: category, displayCategory: displayLabel(category), displayName: deriveDisplayName(id), thumbnailFilename: `thumbnails/${id}.webp`, runtimeFilename: `runtime-assets/${id}.glb`, runtimeBytes, triangleCount: 1, textureCount: 1 });

describe('CatalogRepository', () => {
  it('consumes authoritative display metadata while keeping raw taxonomy and IDs', () => {
    const runtime = [record('sofa_037', 'sofa'), record('wall_018', 'wall')];
    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog(runtime), '/runtime');
    const catalog = new CatalogRepository(registry, parseCatalogPayload([payload('sofa_037', 'sofa'), payload('wall_018', 'wall')]), '/catalog');
    expect(catalog.get('sofa_037')).toMatchObject({ assetId: 'sofa_037', sourceCategory: 'sofa', displayCategory: 'seating', displayName: 'Sofa 37', thumbnailUrl: '/catalog/thumbnails/sofa_037.webp' });
    expect(catalog.get('wall_018').displayCategory).toBe('architecture');
  });

  it('groups and naturally sorts payload items', () => {
    const runtime = [record('chair_010', 'chair'), record('chair_002', 'chair'), record('lamp_048', 'lamp')];
    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog(runtime), '/runtime');
    const catalog = new CatalogRepository(registry, parseCatalogPayload(runtime.map((entry) => payload(entry.id, entry.category))), 'https://images.example/catalog');
    expect(catalog.itemsFor('seating').map((item) => item.assetId)).toEqual(['chair_002', 'chair_010']);
    expect(catalog.categories(new Set(['chair_010']))).toEqual(['seating']);
    expect(catalog.get('lamp_048').thumbnailUrl).toBe('https://images.example/catalog/thumbnails/lamp_048.webp');
  });

  it('rejects duplicate, unsafe, unknown and registry-mismatched payload entries', () => {
    expect(() => parseCatalogPayload([payload('chair_002', 'chair'), payload('chair_002', 'chair')])).toThrow('Duplicate catalog asset ID');
    expect(() => parseCatalogPayload([{ ...payload('chair_002', 'chair'), thumbnailFilename: 'D:\\source.webp' }])).toThrow('Invalid catalog payload entry');
    expect(() => parseCatalogPayload([{ ...payload('chair_002', 'chair'), displayCategory: 'Unknown' }])).toThrow('Unknown display category');
    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog([record('chair_002', 'chair', 2)]), '/runtime');
    expect(() => new CatalogRepository(registry, parseCatalogPayload([payload('chair_002', 'chair', 1)]), '/catalog')).toThrow('Catalog/runtime metadata mismatch');
  });

  it('derives fallback names and rejects unmapped source categories', () => {
    expect(deriveDisplayName('coffee_table_031')).toBe('Coffee Table 31');
    expect(mapDisplayCategory('bathroom')).toBe('kitchen-bath');
    expect(() => mapDisplayCategory('unknown')).toThrow('Unknown source category');
  });
});
