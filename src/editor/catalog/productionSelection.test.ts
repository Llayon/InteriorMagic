import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_CATALOG_VERSION,
  getProductionSelection,
  isProductionCatalogId,
  getVisibleIds,
  withProductionFilter,
  getProductionAssetSemanticRole,
} from './productionSelection';
import selection from './data/production-catalog-v1.json';

interface ManifestShape {
  schemaVersion: number;
  assetCount: number;
  assets: Array<{ assetId: string; semanticRole: string }>;
}
const MANIFEST = selection as ManifestShape;

describe('productionSelection', () => {
  it('schemaVersion is 1', () => {
    expect(PRODUCTION_CATALOG_VERSION).toBe(1);
    expect(MANIFEST.schemaVersion).toBe(1);
  });
  it('returns the same asset records as the JSON manifest', () => {
    const sel = getProductionSelection();
    expect(sel.length).toBe(MANIFEST.assetCount);
    expect(sel.map((a) => a.assetId)).toEqual(MANIFEST.assets.map((a) => a.assetId));
  });
  it('each asset record carries a valid semanticRole', () => {
    const roles = ['sofa','armchair','coffeeTable','sideTable','console','tv','floorLamp','plant','rug','floorDecor'] as const;
    for (const a of getProductionSelection()) expect(roles).toContain(a.semanticRole);
  });
  it('visibleIds derived from records equals the manifest assets', () => {
    expect(getVisibleIds().length).toBe(getProductionSelection().length);
  });
  it('isProductionCatalogId is a stable membership check', () => {
    expect(isProductionCatalogId(getProductionSelection()[0]!.assetId)).toBe(true);
    expect(isProductionCatalogId('not_a_real_id')).toBe(false);
  });
  it('withProductionFilter narrows by assetId', () => {
    const id = getProductionSelection()[0]!.assetId;
    const items = [{ assetId: 'a' }, { assetId: id }, { assetId: 'b' }];
    expect(withProductionFilter(items)).toEqual([{ assetId: id }]);
  });
  it('getProductionAssetSemanticRole returns role or undefined', () => {
    const id = getProductionSelection()[0]!.assetId;
    expect(getProductionAssetSemanticRole(id)).toBe(getProductionSelection()[0]!.semanticRole);
    expect(getProductionAssetSemanticRole('missing')).toBeUndefined();
  });
});