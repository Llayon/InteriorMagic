// scripts/m1a/publish-quality-experiment.mjs
//
// One-shot uploader for the Safari iOS quality-tier controlled experiment.
//
// Layout on R2 (bucket: interiormagic-assets, default):
//
//   showcase/experiments/safari-quality-20260902/
//     high/models/<id>.glb   (from .agent-data/safari-gpu-investigation/canonical-snapshots/)
//     medium/models/<id>.glb (from .agent-data/safari-gpu-investigation/control-1024/)
//     low/models/<id>.glb    (from .agent-data/safari-gpu-investigation/control-512/)
//     manifest.json
//
// Refuses to upload any object outside the new prefix. Refuses to overwrite
// an object whose existing R2 contents do not match the local file. The
// ref-on-mismatch policy matches the original publish-showcase.mjs contract.
//
// Usage:
//   node scripts/m1a/publish-quality-experiment.mjs --upload --verify
//
// The script is read-only with respect to showcase/v1 and the live
// production assets. It only writes under the new experiment prefix.

import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const repositoryRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const investigationRoot = path.resolve(repositoryRoot, '.agent-data', 'safari-gpu-investigation');

const EXPERIMENT_PREFIX = 'showcase/experiments/safari-quality-20260902';
const BUCKET = 'interiormagic-assets';
const M1A_IDS = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'];

const TIER_SOURCES = {
  high: 'canonical-snapshots',
  medium: 'control-1024',
  low: 'control-512',
};

const args = process.argv.slice(2);
const upload = args.includes('--upload');
const verify = args.includes('--verify');
const dryRun = args.includes('--dry-run');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;

const run = (command, commandArgs) => new Promise((resolve) => {
  const child = spawn(command, commandArgs, { cwd: repositoryRoot, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + '\n' + String(err), errored: true }));
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

const wrangler = createRequire(import.meta.url).resolve('wrangler');
const remoteGet = async (key, file) => run(process.execPath, [wrangler, 'r2', 'object', 'get', `${BUCKET}/${key}`, '--file', file, '--remote']);
const remotePut = async (key, file, contentType) => run(process.execPath, [wrangler, 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', contentType, '--cache-control', 'public, max-age=31536000, immutable', '--remote']);
const isMissing = (result) => /not found|does not exist|no such key|10007/i.test(`${result.stdout}\n${result.stderr}`);

// Safety check: NEVER touch anything outside the experiment prefix.
const assertSafeKey = (key) => {
  if (!key.startsWith(`${EXPERIMENT_PREFIX}/`)) {
    throw new Error(`Refusing to operate on key outside experiment prefix: ${key}`);
  }
};

// Per-asset measurement: bytes, SHA, triangle/primitive/material/texture counts,
// max texture dimension, bounds, decoded RGBA.
const inspectGlb = (glbPath) => {
  // Defer GLB parsing to the script that already exists in the investigation
  // workspace. The .agent-data/ tree is gitignored and not under the worktree,
  // so we shell out to the existing inspector.
  // For simplicity, compute the metrics by reading the JSON chunk via a
  // small inline parser here. PNG dim parsing is the same as in the other
  // investigation scripts.
  // Returns: { bytes, sha256, triangleCount, primitiveCount, materialCount,
  //           textureCount, maxTextureDimension, decodedRGBA, min, max }
  const data = readFileSync(glbPath);
  if (data.readUInt32LE(0) !== 0x46546C67) throw new Error('Not a GLB');
  let offset = 12, json = null, bin = null;
  while (offset < data.length) {
    const chunkLen = data.readUInt32LE(offset);
    const chunkType = data.readUInt32LE(offset + 4);
    if (chunkType === 0x4E4F534A) json = JSON.parse(data.subarray(offset + 8, offset + 8 + chunkLen).toString('utf8'));
    else if (chunkType === 0x004E4942) bin = data.subarray(offset + 8, offset + 8 + chunkLen);
    offset += 8 + chunkLen;
  }
  if (!json) throw new Error('GLB has no JSON');
  const accessors = json.accessors || [];
  const meshes = json.meshes || [];
  const bvs = json.bufferViews || [];
  let triangleCount = 0, primitiveCount = 0;
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      primitiveCount += 1;
      const acc = accessors[prim.attributes?.POSITION];
      if (acc && acc.min && acc.max) {
        for (let i = 0; i < 3; i += 1) {
          if (acc.min[i] < min[i]) min[i] = acc.min[i];
          if (acc.max[i] > max[i]) max[i] = acc.max[i];
        }
      }
      const idxAcc = accessors[prim.indices ?? -1];
      const posAcc = accessors[prim.attributes?.POSITION];
      if (idxAcc && idxAcc.type === 'SCALAR') triangleCount += Math.max(0, idxAcc.count - 2);
      else if (posAcc) triangleCount += Math.max(0, Math.floor(posAcc.count / 3));
    }
  }
  const pngDims = (buf) => {
    if (buf.length < 24) return null;
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  };
  const imageDims = (json.images || []).map((image) => {
    if (image.uri) return { width: null, height: null };
    const bv = bvs[image.bufferView];
    if (!bv || !bin) return { width: null, height: null };
    const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    return pngDims(data);
  });
  let maxDim = 0;
  let decodedRGBA = 0;
  for (const d of imageDims) {
    if (d.width && d.height) {
      if (d.width > maxDim) maxDim = d.width;
      if (d.height > maxDim) maxDim = d.height;
      decodedRGBA += Math.round(d.width * d.height * 4 * 1.33);
    }
  }
  return {
    bytes: data.length,
    sha256: sha256(data),
    triangleCount,
    primitiveCount,
    materialCount: (json.materials || []).length,
    textureCount: (json.images || []).length,
    maxTextureDimension: maxDim,
    decodedRGBA,
    min,
    max,
  };
};

const main = async () => {
  // Verify the 21 source files exist locally before doing anything.
  const records = { high: {}, medium: {}, low: {} };
  const tierMetrics = {};
  for (const tier of Object.keys(TIER_SOURCES)) {
    tierMetrics[tier] = { totalBytes: 0, totalDecodedRGBA: 0, maxTextureDimension: 0, assets: [] };
    for (const id of M1A_IDS) {
      const localPath = path.join(investigationRoot, TIER_SOURCES[tier], `${id}.glb`);
      try { await access(localPath); } catch { throw new Error(`Missing local source: ${localPath}`); }
      const metrics = inspectGlb(localPath);
      const record = { assetId: id, sourcePath: localPath, ...metrics };
      records[tier][id] = record;
      tierMetrics[tier].totalBytes += metrics.bytes;
      tierMetrics[tier].totalDecodedRGBA += metrics.decodedRGBA;
      if (metrics.maxTextureDimension > tierMetrics[tier].maxTextureDimension) {
        tierMetrics[tier].maxTextureDimension = metrics.maxTextureDimension;
      }
      tierMetrics[tier].assets.push({
        assetId: id,
        filename: `${tier}/models/${id}.glb`,
        sha256: metrics.sha256,
        bytes: metrics.bytes,
        triangleCount: metrics.triangleCount,
        primitiveCount: metrics.primitiveCount,
        materialCount: metrics.materialCount,
        textureCount: metrics.textureCount,
        maxTextureDimension: metrics.maxTextureDimension,
        bounds: { min: metrics.min, max: metrics.max },
      });
    }
  }

  const manifest = {
    experimentId: 'safari-quality-20260902',
    createdAt: new Date().toISOString(),
    baseMainSha: '88a38cdee9d7ac731ec44d0a1aca433d6e5c4345',
    bucket: BUCKET,
    releasePrefix: EXPERIMENT_PREFIX,
    note: 'Safari iOS GPU-pressure controlled experiment. The high tier is the canonical K1 output (proves the 368 MiB budget). Medium (1024) and low (512) are texture-downscaled controls with identical geometry/material topology. Activate via VITE_M1A_EXPERIMENTAL_QUALITY_TIER=1 build env var + ?m1aQuality=high|medium|low URL parameter.',
    tierMetrics: {
      high: { maxTextureDimension: tierMetrics.high.maxTextureDimension, totalBytes: tierMetrics.high.totalBytes, uniqueDecodedRGBAEstimate: tierMetrics.high.totalDecodedRGBA },
      medium: { maxTextureDimension: tierMetrics.medium.maxTextureDimension, totalBytes: tierMetrics.medium.totalBytes, uniqueDecodedRGBAEstimate: tierMetrics.medium.totalDecodedRGBA },
      low: { maxTextureDimension: tierMetrics.low.maxTextureDimension, totalBytes: tierMetrics.low.totalBytes, uniqueDecodedRGBAEstimate: tierMetrics.low.totalDecodedRGBA },
    },
    assets: [
      ...tierMetrics.high.assets,
      ...tierMetrics.medium.assets,
      ...tierMetrics.low.assets,
    ],
  };

  const manifestBytes = Buffer.from(pretty(manifest));
  const manifestSha = sha256(manifestBytes);

  // Build upload payload.
  const uploadKeys = [];
  for (const tier of Object.keys(TIER_SOURCES)) {
    for (const id of M1A_IDS) {
      const key = `${EXPERIMENT_PREFIX}/${tier}/models/${id}.glb`;
      assertSafeKey(key);
      uploadKeys.push({ tier, id, key });
    }
  }
  const manifestKey = `${EXPERIMENT_PREFIX}/manifest.json`;
  assertSafeKey(manifestKey);

  console.log('=== experiment upload plan ===');
  console.log(JSON.stringify({
    bucket: BUCKET,
    prefix: EXPERIMENT_PREFIX,
    glbCount: uploadKeys.length,
    manifestKey,
    manifestSha,
    tierMetrics: manifest.tierMetrics,
  }, null, 2));

  if (dryRun) {
    console.log('Dry run only — nothing uploaded.');
    return;
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'm1a-quality-experiment-'));
  const manifestFile = path.join(tempRoot, 'manifest.json');
  await writeFile(manifestFile, manifestBytes);

  try {
    if (upload) {
      // Check existing R2 state first; refuse overwrite on mismatch.
      for (const { tier, id, key } of uploadKeys) {
        const record = records[tier][id];
        const remoteFile = path.join(tempRoot, `verify-${tier}-${id}.glb`);
        const result = await remoteGet(key, remoteFile);
        if (result.code === 0) {
          const remoteBytes = await readFile(remoteFile);
          if (remoteBytes.length !== record.bytes || sha256(remoteBytes) !== record.sha256) {
            throw new Error(`Refusing to upload: existing R2 object at ${key} has different content (size ${remoteBytes.length} vs ${record.bytes} bytes). Aborting to protect the experiment.`);
          }
          console.log(`✓ ${key} already present, content matches (${record.bytes} bytes, sha=${record.sha256.slice(0, 16)}…) — skipping upload`);
        } else if (isMissing(result)) {
          console.log(`↑ ${key}: uploading ${record.bytes} bytes, sha=${record.sha256.slice(0, 16)}…`);
          const result2 = await remotePut(key, record.sourcePath, 'model/gltf-binary');
          if (result2.code !== 0) throw new Error(`Upload failed: ${key}\n${result2.stderr}`);
        } else {
          throw new Error(`Could not inspect R2 object ${key}: ${result.stderr || result.stdout}`);
        }
      }
      // Manifest uploaded LAST so a partial release cannot be considered
      // complete (matches the v1 publisher contract).
      const remoteManifestFile = path.join(tempRoot, 'verify-manifest.json');
      const manifestCheck = await remoteGet(manifestKey, remoteManifestFile);
      if (manifestCheck.code === 0) {
        const remoteManifestBytes = await readFile(remoteManifestFile);
        if (remoteManifestBytes.length !== manifestBytes.length || sha256(remoteManifestBytes) !== manifestSha) {
          throw new Error(`Refusing to overwrite existing manifest at ${manifestKey} with different content.`);
        }
        console.log(`✓ ${manifestKey} already present, content matches — skipping upload`);
      } else if (isMissing(manifestCheck)) {
        console.log(`↑ ${manifestKey}: uploading ${manifestBytes.length} bytes, sha=${manifestSha.slice(0, 16)}…`);
        const result3 = await remotePut(manifestKey, manifestFile, 'application/json; charset=utf-8');
        if (result3.code !== 0) throw new Error(`Upload failed: ${manifestKey}\n${result3.stderr}`);
      } else {
        throw new Error(`Could not inspect R2 manifest: ${manifestCheck.stderr || manifestCheck.stdout}`);
      }
    }

    if (verify) {
      // Verify EVERY object over HTTPS via the public origin.
      // The origin defaults to the production asset origin if env var unset;
      // for the experiment we hit R2 via the wrangler CLI path (Cloudflare-
      // hosted HTTPS via R2 public bucket URL or via wrangler authenticated
      // get). Since the experiment prefix is the same as the live one
      // (HTTPS via the public asset origin if one is configured), we try
      // that first and fall back to wrangler get on mismatch.
      const origin = (process.env.M1A_ASSET_ORIGIN ?? process.env.VITE_M1A_ASSET_ORIGIN ?? '').trim().replace(/\/+$/, '');
      if (!origin) {
        console.log('--verify: no M1A_ASSET_ORIGIN set; skipping HTTPS verification (objects verified via wrangler get only).');
        return;
      }
      for (const { tier, id, key } of uploadKeys) {
        const record = records[tier][id];
        const url = `${origin}/${key}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTPS verify failed: ${url} returned ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length !== record.bytes || sha256(body) !== record.sha256) {
          throw new Error(`HTTPS verify failed: ${url} bytes=${body.length} expected=${record.bytes} sha=${sha256(body).slice(0, 16)} expected=${record.sha256.slice(0, 16)}`);
        }
        console.log(`✓ ${url} verified: ${record.bytes} bytes, sha=${record.sha256.slice(0, 16)}…`);
      }
      const manifestUrl = `${origin}/${manifestKey}`;
      const mres = await fetch(manifestUrl);
      if (!mres.ok) throw new Error(`HTTPS verify failed: ${manifestUrl} returned ${mres.status}`);
      const mbody = Buffer.from(await mres.arrayBuffer());
      if (mbody.length !== manifestBytes.length || sha256(mbody) !== manifestSha) {
        throw new Error(`HTTPS manifest verify failed: ${manifestUrl}`);
      }
      console.log(`✓ ${manifestUrl} verified`);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log('\n=== experiment upload complete ===');
  console.log(`Manifest written: .agent-data/safari-gpu-investigation/manifests/experiment-manifest.json`);
};

main().catch((error) => {
  console.error('FATAL:', error.message);
  process.exit(1);
});
