import { describe, expect, it } from 'vitest';
import { parseAr0Manifest } from './manifest';
import { getAr0Revision } from './revisions';

const revision = getAr0Revision('sheen-chair-r1')!;
const valid = {
  schemaVersion: 2,
  arRevisionId: 'sheen-chair-r1',
  assetId: 'sheenChair',
  spatial: {
    dimensionsMeters: { width: 0.826557978, height: 0.686247078, depth: 0.570265459 },
    placementAnchor: 'floor',
  },
  ar: { scale: 'fixed', placement: 'floor' },
  files: {
    glb: { path: 'model.glb', sha256: 'a'.repeat(64) },
    usdz: { path: 'model.usdz', sha256: 'b'.repeat(64) },
    poster: { path: 'poster.webp', sha256: 'c'.repeat(64) },
  },
};

describe('AR0 manifest v2 parser', () => {
  it('accepts a valid v2 manifest', () => {
    expect(parseAr0Manifest(valid, revision).arRevisionId).toBe('sheen-chair-r1');
  });

  it.each([
    ['schema v1', { schemaVersion: 1 }],
    ['wrong revision', { arRevisionId: 'other-r1' }],
    ['missing dimensions', { spatial: { placementAnchor: 'floor' } }],
    ['NaN dimensions', { spatial: { ...valid.spatial, dimensionsMeters: { ...valid.spatial.dimensionsMeters, width: Number.NaN } } }],
    ['non-positive dimensions', { spatial: { ...valid.spatial, dimensionsMeters: { ...valid.spatial.dimensionsMeters, height: 0 } } }],
    ['unsupported scale', { ar: { scale: 'auto', placement: 'floor' } }],
    ['unsupported placement', { ar: { scale: 'fixed', placement: 'wall' } }],
    ['wrong path', { files: { ...valid.files, glb: { ...valid.files.glb, path: 'other.glb' } } }],
    ['wrong sha', { files: { ...valid.files, usdz: { ...valid.files.usdz, sha256: 'not-a-sha' } } }],
  ] as const)('rejects %s', (_label, patch) => {
    expect(() => parseAr0Manifest({ ...valid, ...patch }, revision)).toThrow();
  });

  it('does not accept the legacy assetRevisionId field', () => {
    expect(() => parseAr0Manifest({ ...valid, schemaVersion: 1, assetRevisionId: 'sheen-chair-r1' }, revision)).toThrow();
  });
});
