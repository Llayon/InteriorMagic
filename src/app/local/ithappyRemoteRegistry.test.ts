import { describe, expect, it } from 'vitest';
import { normalizeRemoteAssetOrigin } from './ithappyRegistryPrototype';

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
  });
});
