import { describe, expect, it } from 'vitest';
import { normalizeRemoteAssetOrigin, normalizeRemotePreviewMetadataUrl } from './ithappyRegistryPrototype';

describe('remote ITHappy asset origin', () => {
  it('normalizes a provider-neutral HTTPS release root', () => {
    expect(normalizeRemoteAssetOrigin('https://assets.example.test/catalog/v1')).toBe('https://assets.example.test/catalog/v1/');
  });

  it('rejects insecure and malformed origins', () => {
    expect(() => normalizeRemoteAssetOrigin('http://assets.example.test/catalog/v1')).toThrow(/HTTPS/);
    expect(() => normalizeRemoteAssetOrigin('not a URL')).toThrow();
  });

  it('allows loopback HTTP for local remote-delivery QA', () => {
    expect(normalizeRemoteAssetOrigin('http://127.0.0.1:4174/catalog/v1')).toBe('http://127.0.0.1:4174/catalog/v1/');
    expect(normalizeRemotePreviewMetadataUrl('http://127.0.0.1:4173/.local-assets/ithappy-registry/prototype-placement.json')).toContain('prototype-placement.json');
  });

  it('requires the explicit preview namespace for remote metadata', () => {
    expect(normalizeRemotePreviewMetadataUrl('https://assets.example.test/preview/v1/prototype-placement.json')).toContain('/preview/v1/');
    expect(() => normalizeRemotePreviewMetadataUrl('https://assets.example.test/catalog/v1/prototype-placement.json')).toThrow(/explicit preview/);
  });
});
