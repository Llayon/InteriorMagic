import { describe, expect, it } from 'vitest';
import {
  CatalogRepository,
  configureCatalogRepository,
  getCatalogConfiguration,
  parseCatalogPayload,
} from './CatalogRepository';
import { RuntimeAssetRegistry, parseRuntimeCatalog } from '@/editor/assets/RuntimeAssetRegistry';
import { getVisibleIds } from './productionSelection';

interface PayloadEntry {
  assetId: string;
  sourceCategory: string;
  displayCategory: string;
  displayName: string;
  thumbnailFilename: string;
  runtimeFilename: string;
  runtimeBytes: number;
  triangleCount: number;
  textureCount: number;
}

const record = (id: string, category: string) => ({
  id, category, runtimeFilename: `runtime-assets/${id}.glb`, runtimeBytes: 1, triangleCount: 1,
  primitiveCount: 1, materialCount: 1, textureCount: 1, maxTextureDimension: 512,
  analyticalDecodedRGBABytes: 4, policyVersion: 1,
});
const payload = (id: string, category: string): PayloadEntry => ({
  assetId: id, sourceCategory: category,
  displayCategory: ({ sofa: 'Seating', chair: 'Seating', lamp: 'Lighting', wall: 'Architecture' } as Record<string, string>)[category] ?? 'Decor',
  displayName: id, thumbnailFilename: `thumbnails/${id}.webp`, runtimeFilename: `runtime-assets/${id}.glb`,
  runtimeBytes: 1, triangleCount: 1, textureCount: 1,
});

describe('productionSelection integration — real reduction 3→2 (A9)', () => {
  it('visibleIds narrows CatalogRepository: 3 → 2', () => {
    const visibleIds = [...getVisibleIds()];
    const A = visibleIds[0]!;
    const B = visibleIds[1] ?? visibleIds[0]!;
    const C = 'fake_synthetic_third_id_for_reduction_test';

    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog([
      record(A, 'sofa'),
      record(B, 'chair'),
      record(C, 'wall'),
    ]), '/');
    const catalog = new CatalogRepository(registry, parseCatalogPayload([
      payload(A, 'sofa'),
      payload(B, 'chair'),
      payload(C, 'wall'),
    ]), '/');

    // Sanity: no visibleIds set → 2 seating + 1 architecture = 3 unfiltered.
    expect(catalog.itemsFor('seating').length).toBe(2);
    expect(catalog.itemsFor('architecture').length).toBe(1);

    // Configure with production visibleIds (A + B; C is not in production).
    configureCatalogRepository(catalog, {
      visibleIds: [A, B],
      placementEnabledCategories: ['seating', 'tables', 'storage', 'lighting', 'plants', 'decor'],
    });

    const config = getCatalogConfiguration();
    expect(config).not.toBeNull();
    expect(config!.repository).toBe(catalog);
    expect(config!.placementEnabledCategories.has('seating')).toBe(true);

    // With visibleIds narrowed, itemsFor respects membership.
    const seatingAfter = catalog.itemsFor('seating', config!.visibleIds!);
    expect(seatingAfter.length).toBe(2);
    expect(seatingAfter.map((i) => i.assetId).sort()).toEqual([A, B].sort());
    const architectureAfter = catalog.itemsFor('architecture', config!.visibleIds!);
    expect(architectureAfter.length).toBe(0); // C excluded
  });
});