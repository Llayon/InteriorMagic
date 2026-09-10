// tests/catalog/upstream/m1a-runtime-integrity.test.mjs
//
// Upstream-only regression test. Triggered via:
//   npm run test:catalog:upstream
//
// This test would have caught the iOS Safari WebGL context-loss bug
// (PR that investigates it: see .hermes/plans/2026-09-01-safari-gpu-pressure.md):
// the runtimeNumbers block in src/app/showcase/m1aShowcase.ts was created
// from SOURCE GLBs and never updated to reflect the actual canonical GLBs
// shipped under showcase/v1.
//
// The mismatch:
//   - declared maxTextureDimension: 512 (across all 7 M1A assets)
//   - actual  maxTextureDimension: 2048 (in the canonical GLBs in R2)
//   - declared runtimeBytes:        1,725,432 total
//   - actual  runtimeBytes:        29,102,740 total
//   - declared analyticalDecodedRGBA: 22,020,096 total
//   - actual  estimatedDecodedRGBA:  368,175,999 total
//
// This test reads the local canonical files (via M1A_LOCAL_ASSET_ROOT,
// defaulting to <repo>/.agent-data/k1-production-assets/canonical), parses
// each GLB's JSON chunk + BIN-chunk PNG headers, and asserts that every
// declared value in m1aShowcase.ts matches the actual canonical file.
//
// If a future canonicalization pipeline re-emits a GLB with different
// bytes/textures, the test fails closed: a manifest saying "512px" must
// never ship a "2048px" runtime texture silently.
//
// The test only runs when M1A_LOCAL_ASSET_ROOT points to real canonical
// files. In CI without that env var, the test skips cleanly — same
// pattern the existing upstream tests use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..'); // tests/catalog/upstream/ → worktree root
const CANONICAL_ROOT = process.env.M1A_LOCAL_ASSET_ROOT
  ? resolve(process.env.M1A_LOCAL_ASSET_ROOT, 'canonical')
  : join(REPO_ROOT, '.agent-data', 'k1-production-assets', 'canonical');
const M1A_SHOWCASE_TS = join(REPO_ROOT, 'src', 'app', 'showcase', 'm1aShowcase.ts');
const EVIDENCE_JSON = join(REPO_ROOT, 'src', 'editor', 'catalog', 'data', 'production-asset-spatial-evidence-v1.json');

const M1A_IDS = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'];

// Skip the whole file when the canonical root does not exist (CI without
// M1A_LOCAL_ASSET_ROOT). The per-asset tests below handle the missing-file
// case individually via t.skip().

const pngDims = (buf) => {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504E47) return null; // PNG sig
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

// Read JPEG dimensions by walking SOF0/SOF2 markers.
const jpegDims = (buf) => {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) return null;
    while (buf[i] === 0xFF) i += 1;
    const marker = buf[i]; i += 1;
    if (marker === 0xD8 || marker === 0xD9) continue;
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) continue;
    if (i + 2 > buf.length) return null;
    const segLen = (buf[i] << 8) | buf[i + 1]; i += 2;
    if (marker === 0xC0 || marker === 0xC2) {
      if (i + 5 > buf.length) return null;
      return { width: (buf[i + 3] << 8) | buf[i + 4], height: (buf[i + 1] << 8) | buf[i + 2] };
    }
    i += segLen - 2;
  }
  return null;
};

// Parse a GLB file, return JSON, BIN, and per-image dimensions.
const parseGlb = (bytes) => {
  if (bytes.readUInt32LE(0) !== 0x46546C67) throw new Error('Not a GLB (magic mismatch)');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < bytes.length) {
    const chunkLen = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    if (chunkType === 0x4E4F534A) json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + chunkLen).toString('utf8'));
    else if (chunkType === 0x004E4942) bin = bytes.subarray(offset + 8, offset + 8 + chunkLen);
    offset += 8 + chunkLen;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  const dims = (json.images || []).map((image, i) => {
    if (image.uri) return { index: i, external: true };
    const bv = (json.bufferViews || [])[image.bufferView];
    if (!bv || !bin) return { index: i, embedded: true, dimsUnknown: true };
    const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    return { index: i, embedded: true, ...(pngDims(data) || jpegDims(data) || { dimsUnknown: true }) };
  });
  return { json, bin, dims };
};

const parseRuntimeNumbers = (src) => {
  // The runtimeNumbers block lives in m1aShowcase.ts; we extract it via a
  // bounded regex that doesn't rely on a TS parser. This is the same shape
  // the file uses, with stable formatting per the project's style.
  const block = src.match(/const runtimeNumbers[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('Could not locate runtimeNumbers in m1aShowcase.ts');
  const out = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*([a-zA-Z0-9_]+):\s*\{([^}]+)\},?\s*$/);
    if (!m) continue;
    const fields = {};
    for (const fm of m[2].matchAll(/(\w+):\s*([^,]+)/g)) {
      fields[fm[1]] = Number(fm[2].trim());
    }
    out[m[1]] = fields;
  }
  return out;
};

test('M1A runtime integrity upstream gate', async (t) => {
  if (!existsSync(CANONICAL_ROOT)) {
    t.skip('canonical root not found at ' + CANONICAL_ROOT);
    return;
  }
  const m1aSrc = await readFile(M1A_SHOWCASE_TS, 'utf8');
  const evidence = JSON.parse(await readFile(EVIDENCE_JSON, 'utf8'));
  const evidenceById = new Map(evidence.entries.map((e) => [e.assetId, e]));
  const runtime = parseRuntimeNumbers(m1aSrc);

  await t.test('declared assetIds match the canonical M1A selection', () => {
    assert.deepEqual(Object.keys(runtime).sort(), [...M1A_IDS].sort(),
      'm1aShowcase.ts runtimeNumbers keys do not match the 7 M1A assetIds');
  });

  for (const assetId of M1A_IDS) {
    await t.test(`asset ${assetId}: canonical SHA, bytes, image count, and max texture dim match the declared manifest`, async () => {
      const glbPath = join(CANONICAL_ROOT, `${assetId}.glb`);
      if (!existsSync(glbPath)) {
        assert.fail(`canonical GLB missing: ${glbPath}`);
        return;
      }
      const bytes = await readFile(glbPath);
      const sha = createHash('sha256').update(bytes).digest('hex');
      const declared = runtime[assetId];
      const evidenceRow = evidenceById.get(assetId);

      // 1. SHA256 must equal the frozen canonical SHA in production-asset-spatial-evidence-v1.json.
      assert.equal(sha, evidenceRow.canonicalSha256,
        `local canonical SHA ${sha} does not match frozen evidence.canonicalSha256 ${evidenceRow.canonicalSha256} for ${assetId}`);

      // 2. Byte count must equal declared runtimeBytes. A drift here means the
      //    canonicalization pipeline re-emitted the GLB but nobody updated the
      //    runtime manifest — which is exactly the iOS Safari context-loss bug.
      assert.equal(bytes.length, declared.runtimeBytes,
        `declared runtimeBytes ${declared.runtimeBytes} for ${assetId} does not match actual canonical bytes ${bytes.length} — runtime manifest is stale`);

      // 3. Parse the GLB and assert image count + max texture dim.
      const { json, dims } = parseGlb(bytes);
      const imageCount = (json.images || []).length;
      const maxDim = dims.reduce((m, d) => Math.max(m, d.width ?? 0, d.height ?? 0), 0);

      assert.equal(imageCount, declared.textureCount,
        `declared textureCount ${declared.textureCount} for ${assetId} does not match GLB image count ${imageCount}`);

      assert.equal(maxDim, declared.maxTextureDimension,
        `declared maxTextureDimension ${declared.maxTextureDimension} for ${assetId} does not match actual ${maxDim} — runtime manifest is stale`);
    });
  }

  await t.test('total declared runtimeBytes equals sum of actual canonical bytes', async () => {
    let total = 0;
    for (const assetId of M1A_IDS) {
      const bytes = await readFile(join(CANONICAL_ROOT, `${assetId}.glb`));
      total += bytes.length;
    }
    const declaredTotal = M1A_IDS.reduce((s, id) => s + runtime[id].runtimeBytes, 0);
    assert.equal(declaredTotal, total,
      `declared total runtimeBytes ${declaredTotal} does not match sum of actual canonical bytes ${total}`);
  });
});
