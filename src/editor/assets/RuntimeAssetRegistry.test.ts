import { describe, expect, it } from 'vitest';
import { parseRuntimeCatalog, RuntimeAssetRegistry } from './RuntimeAssetRegistry';

const entry = {
  id: 'sofa_037', runtimeFilename: 'runtime-assets/sofa_037.glb', category: 'sofa', runtimeBytes: 196336,
  triangleCount: 504, primitiveCount: 2, materialCount: 2, textureCount: 3,
  maxTextureDimension: 512, analyticalDecodedRGBABytes: 3145728, policyVersion: 1,
};

describe('RuntimeAssetRegistry', () => {
  it('parses manifest records and resolves stable IDs', () => {
    const entries = parseRuntimeCatalog([entry]);
    const registry = new RuntimeAssetRegistry(entries, '/local-assets');
    expect(registry.size).toBe(1);
    expect(registry.get('sofa_037')).toEqual(entry);
    expect(registry.resolveAssetUrl('sofa_037')).toBe('/local-assets/runtime-assets/sofa_037.glb');
  });

  it('supports substituting the physical asset base', () => {
    const registry = new RuntimeAssetRegistry(parseRuntimeCatalog([entry]), 'https://assets.example/catalog/');
    expect(registry.resolveAssetUrl('sofa_037')).toBe('https://assets.example/catalog/runtime-assets/sofa_037.glb');
  });

  it('rejects unknown IDs, duplicates and source-path-like filenames', () => {
    const entries = parseRuntimeCatalog([entry]);
    expect(() => new RuntimeAssetRegistry(entries, '/assets').get('missing')).toThrow('Unknown runtime asset: missing');
    expect(() => parseRuntimeCatalog([entry, entry])).toThrow('Duplicate runtime asset ID');
    expect(() => parseRuntimeCatalog([{ ...entry, runtimeFilename: 'D:\\source\\sofa.glb' }])).toThrow('Invalid runtime catalog entry');
    expect(() => parseRuntimeCatalog([{ ...entry, runtimeFilename: '../source/sofa.glb' }])).toThrow('Invalid runtime catalog entry');
  });
});
