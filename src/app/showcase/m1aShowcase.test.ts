import { describe, expect, it } from 'vitest';
import selection from '@/editor/catalog/data/production-catalog-v1.json';
import facts from '@/editor/catalog/data/production-asset-facts-v1.json';
import evidence from '@/editor/catalog/data/production-asset-spatial-evidence-v1.json';
import { createM1AShowcaseProject, getM1AAssetDefinition, M1A_CATALOG_IDS, M1A_SELECTED_IDS, resolveM1AAsset, resolveM1AAssetBase, type AuthorityInput } from './m1aShowcase';

describe('M1A private showcase authority boundary', () => {
  it('resolves local and immutable production delivery URLs fail-closed', () => {
    expect(resolveM1AAssetBase({ production: false })).toBe('/__m1a_assets__/');
    expect(resolveM1AAssetBase({ production: true, origin: 'https://assets.example.test' })).toBe('https://assets.example.test/showcase/v1/');
    expect(() => resolveM1AAssetBase({ production: true })).toThrow(/ASSET_ORIGIN/);
    expect(() => resolveM1AAssetBase({ production: true, origin: 'http://assets.example.test' })).toThrow(/HTTPS/);
    expect(() => resolveM1AAssetBase({ production: true, origin: 'https://assets.example.test/showcase/v1' })).toThrow(/origin/);
  });
  it('uses exactly the seven selected IDs and authoritative K1 records', () => {
    expect(new Set(M1A_SELECTED_IDS).size).toBe(7);
    expect(M1A_SELECTED_IDS).toEqual(['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030']);
    for (const id of M1A_SELECTED_IDS) {
      expect(selection.assets.filter((asset) => asset.assetId === id)).toHaveLength(1);
      expect(facts.assets.filter((asset) => asset.assetId === id)).toHaveLength(1);
      expect(evidence.entries.filter((entry) => entry.assetId === id)).toHaveLength(1);
      expect(evidence.entries.find((entry) => entry.assetId === id)?.semanticMismatch).toBe(false);
      expect(evidence.entries.find((entry) => entry.assetId === id)?.canonicalVisualQa).toBe('pass');
      expect(getM1AAssetDefinition(id)?.normalization).toEqual({ recenterToFootprint: false });
    }
  });
  it('keeps the catalog to four addable items and the seed topology to eight instances', () => {
    expect(M1A_CATALOG_IDS).toEqual(['chair', 'carpet', 'dresser_001', 'lamp']);
    const project = createM1AShowcaseProject();
    expect(project.room).toEqual({ width: 6.2, depth: 5.8, height: 2.7 });
    expect(project.objects).toHaveLength(8);
    expect(project.objects.map((object) => object.instanceId)).toEqual(['showcase-rug', 'showcase-sofa', 'showcase-chair-left', 'showcase-chair-right', 'showcase-table', 'showcase-console', 'showcase-lamp', 'showcase-tv']);
    expect(project.objects.filter((object) => object.assetId === 'electronics')).toHaveLength(1);
    expect(getM1AAssetDefinition('electronics')?.placement.anchor).toBe('wall');
    expect(getM1AAssetDefinition('electronics')?.collision).toEqual({ group: 0, mask: 0 });
  });
  it('fails closed for missing, duplicate, verdict-mismatched, and invalid authority rows', () => {
    const authority = (): AuthorityInput => ({ selection: structuredClone(selection), facts: structuredClone(facts), evidence: structuredClone(evidence) });
    const missing = authority(); missing.facts.assets = missing.facts.assets.filter((row) => row.assetId !== 'chair');
    expect(() => resolveM1AAsset('chair', missing)).toThrow('cardinality');
    const duplicate = authority(); duplicate.selection.assets.push(structuredClone(duplicate.selection.assets.find((row) => row.assetId === 'chair')!));
    expect(() => resolveM1AAsset('chair', duplicate)).toThrow('cardinality');
    const verdict = authority(); verdict.evidence.entries.find((row) => row.assetId === 'chair')!.semanticMismatch = true;
    expect(() => resolveM1AAsset('chair', verdict)).toThrow('verdict');
    const geometry = authority(); geometry.facts.assets.find((row) => row.assetId === 'chair')!.dimensions.width = Number.NaN;
    expect(() => resolveM1AAsset('chair', geometry)).toThrow('geometry');
  });
});
