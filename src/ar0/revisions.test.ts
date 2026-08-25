import { describe, expect, it } from 'vitest';
import { buildAr0LandingUrl, buildAr0RevisionBaseUrl, getAr0Revision, getAr0RevisionForAsset } from './revisions';

describe('AR0 revision resolution', () => {
  it('maps only Sheen Chair to its immutable revision', () => {
    expect(getAr0RevisionForAsset('sheenChair')).toMatchObject({ assetRevisionId: 'sheen-chair-r1', assetId: 'sheenChair' });
    expect(getAr0RevisionForAsset('chair')).toBeNull();
    expect(getAr0RevisionForAsset('sofa')).toBeNull();
    expect(getAr0Revision('unknown')).toBeNull();
  });

  it('builds an absolute landing URL under Vite BASE_URL', () => {
    expect(buildAr0LandingUrl('sheen-chair-r1', { locationOrigin: 'https://example.test', baseUrl: '/InteriorMagic/' }))
      .toBe('https://example.test/InteriorMagic/?ar=sheen-chair-r1');
  });

  it('uses same-origin assets locally and a configured remote origin explicitly', () => {
    const revision = getAr0Revision('sheen-chair-r1')!;
    expect(buildAr0RevisionBaseUrl(revision, { locationOrigin: 'http://127.0.0.1:4173', baseUrl: '/InteriorMagic/' }))
      .toBe('http://127.0.0.1:4173/InteriorMagic/ar0/sheen-chair/r1/');
    expect(buildAr0RevisionBaseUrl(revision, { locationOrigin: 'https://app.test', baseUrl: '/', assetOrigin: 'https://assets.test' }))
      .toBe('https://assets.test/ar0/sheen-chair/r1/');
  });
});
