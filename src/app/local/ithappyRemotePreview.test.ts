import { describe, expect, it } from 'vitest';
import { resolveIthappyRemotePreviewOrigin } from './ithappyRemotePreview';

const origin = 'https://assets.example.test/catalog/v1/';
const placementMetadataUrl = 'https://assets.example.test/preview/v1/prototype-placement.json';

describe('ITHappy production preview gate', () => {
  it('ignores the remote query when the build flag is absent', () => {
    expect(resolveIthappyRemotePreviewOrigin('?registry=ithappy-remote', { assetOrigin: origin })).toBeNull();
  });

  it('does not activate on the normal application URL', () => {
    expect(resolveIthappyRemotePreviewOrigin('', { enabled: 'true', assetOrigin: origin })).toBeNull();
  });

  it('resolves the public read origin only for an enabled explicit preview', () => {
    expect(resolveIthappyRemotePreviewOrigin('?registry=ithappy-remote', { enabled: 'true', assetOrigin: origin, placementMetadataUrl })).toEqual({ assetOrigin: origin, placementMetadataUrl });
  });

  it('requires an origin only after explicit activation', () => {
    expect(() => resolveIthappyRemotePreviewOrigin('?registry=ithappy-remote', { enabled: 'true' })).toThrow(/ASSET_ORIGIN/);
  });
});
