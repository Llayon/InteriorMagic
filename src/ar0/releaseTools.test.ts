import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureGlbFile } from '../../scripts/ar0/glb-bounds.mjs';
import { readApprovedBlenderVersion } from '../../scripts/ar0/blender-provenance.mjs';
import { assertRemoteMediaType } from '../../scripts/ar0/remote-media-type.mjs';
import { AR0_REVISION_ID, validateUsdzEvidence } from '../../scripts/ar0/usdz-evidence.mjs';

const revisionRoot = path.resolve('public/ar0/sheen-chair/r1');
const evidencePath = path.resolve('docs/ar/evidence/sheen-chair-r1/usdz-stage-report.json');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const loadCurrentEvidence = async () => {
  const [evidenceBytes, usdzBytes, glbBounds] = await Promise.all([
    readFile(evidencePath),
    readFile(path.join(revisionRoot, 'model.usdz')),
    measureGlbFile(path.join(revisionRoot, 'model.glb')),
  ]);
  return {
    evidence: JSON.parse(evidenceBytes.toString('utf8')),
    expected: { assetRevisionId: AR0_REVISION_ID, usdzSha256: sha256(usdzBytes), glbSize: glbBounds.size },
  };
};

describe('fail-closed USDZ validation evidence', () => {
  it('accepts the committed evidence for the exact staged revision', async () => {
    const { evidence, expected } = await loadCurrentEvidence();
    expect(validateUsdzEvidence(evidence, expected).usdzSha256).toBe(expected.usdzSha256);
  });

  it('rejects missing evidence', async () => {
    const { expected } = await loadCurrentEvidence();
    expect(() => validateUsdzEvidence(null, expected)).toThrow(/missing or malformed/u);
  });

  it('rejects evidence bound to a different USDZ hash', async () => {
    const { evidence, expected } = await loadCurrentEvidence();
    expect(() => validateUsdzEvidence({ ...evidence, usdzSha256: '0'.repeat(64) }, expected)).toThrow(/hash/u);
  });

  it('rejects a non-meter USD stage', async () => {
    const { evidence, expected } = await loadCurrentEvidence();
    expect(() => validateUsdzEvidence({ ...evidence, metersPerUnit: 0.01 }, expected)).toThrow(/metersPerUnit/u);
  });

  it('rejects unresolved dependencies', async () => {
    const { evidence, expected } = await loadCurrentEvidence();
    const dependencies = { ...evidence.dependencies, unresolved: ['missing.png'] };
    expect(() => validateUsdzEvidence({ ...evidence, dependencies }, expected)).toThrow(/unresolved/u);
  });

  it('rejects a dimension mismatch above one percent', async () => {
    const { evidence, expected } = await loadCurrentEvidence();
    const stageBounds = { ...evidence.stageBounds, sizeMeters: [...evidence.stageBounds.sizeMeters] };
    stageBounds.sizeMeters[0] *= 1.02;
    expect(() => validateUsdzEvidence({ ...evidence, stageBounds }, expected)).toThrow(/exceeds 1%/u);
  });
});

describe('remote AR0 MIME validation', () => {
  const artifacts = [
    ['model.glb', 'model/gltf-binary', 'model/gltf-binary'],
    ['model.usdz', 'model/vnd.usdz+zip', 'model/vnd.usdz+zip'],
    ['poster.webp', 'image/webp', 'image/webp'],
    ['manifest.json', 'application/json; charset=utf-8', 'application/json'],
    ['checksums.json', 'application/json', 'application/json; charset=utf-8'],
  ] as const;

  it.each(artifacts)('accepts the expected media type for %s', (file, actual, expected) => {
    expect(() => assertRemoteMediaType(file, actual, expected)).not.toThrow();
  });

  it.each(artifacts)('rejects a wrong media type for %s', (file, _actual, expected) => {
    expect(() => assertRemoteMediaType(file, 'application/octet-stream', expected)).toThrow(file);
  });
});

describe('Blender conversion provenance', () => {
  it('uses the actual approved version reported by Blender', () => {
    const report = { schemaVersion: 1, converter: { name: 'Blender', version: '5.2.3 LTS' } };
    expect(readApprovedBlenderVersion(report)).toBe('5.2.3 LTS');
  });

  it('rejects a mislabeled converter outside the approved 5.2 line', () => {
    const report = { schemaVersion: 1, converter: { name: 'Blender', version: '4.3.0 LTS' } };
    expect(() => readApprovedBlenderVersion(report)).toThrow(/approved Blender 5.2/u);
  });
});
