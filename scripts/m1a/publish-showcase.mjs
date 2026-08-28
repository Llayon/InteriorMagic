import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dataRoot = path.join(repositoryRoot, '.agent-data');
const canonicalRoot = path.resolve(process.env.M1A_CANONICAL_ROOT || path.join(dataRoot, 'k1-production-assets', 'canonical'));
const thumbnailRoot = path.resolve(process.env.M1A_THUMBNAIL_ROOT || path.join(dataRoot, 'k1-production-assets', 'visual', 'canonical'));
const authorityFile = path.join(repositoryRoot, 'src/editor/catalog/data/production-asset-spatial-evidence-v1.json');
const release = 'showcase/v1';
const ids = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'];
const thumbnailFiles = Object.fromEntries(ids.map((id) => [id, `${id}__+Z.png`]));
const args = process.argv.slice(2);
const upload = args.includes('--upload');
const verify = args.includes('--verify');
const origin = (args.find((_, i) => args[i - 1] === '--origin') || process.env.M1A_ASSET_ORIGIN || process.env.VITE_M1A_ASSET_ORIGIN || '').replace(/\/+$/, '');
const argBucket = args.find((_, i) => args[i - 1] === '--bucket');
const bucket = argBucket || process.env.M1A_R2_BUCKET || 'interiormagic-assets';
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error(`Invalid bucket: ${bucket}`);
if (args.some((arg) => !['--upload', '--verify', '--dry-run', '--origin', origin, '--bucket', bucket].includes(arg))) throw new Error('Unsupported publisher argument');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;
const run = (command, commandArgs) => new Promise((resolve) => {
  const child = spawn(command, commandArgs, { cwd: repositoryRoot, shell: false, windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});
const wrangler = createRequire(import.meta.url).resolve('wrangler');
const remoteGet = async (key, file) => run(process.execPath, [wrangler, 'r2', 'object', 'get', `${bucket}/${key}`, '--file', file, '--remote']);
const isMissing = (result) => /not found|does not exist|no such key|10007/i.test(`${result.stdout}\n${result.stderr}`);

const evidence = JSON.parse(await readFile(authorityFile, 'utf8'));
const evidenceById = new Map(evidence.entries.map((entry) => [entry.assetId, entry]));
const records = [];
for (const id of ids) {
  if (!evidenceById.has(id) || typeof evidenceById.get(id).canonicalSha256 !== 'string') throw new Error(`Missing frozen canonical SHA: ${id}`);
  const modelFile = path.join(canonicalRoot, `${id}.glb`);
  const thumbFile = path.join(thumbnailRoot, thumbnailFiles[id]);
  if (!modelFile.startsWith(`${canonicalRoot}${path.sep}`) || !thumbFile.startsWith(`${thumbnailRoot}${path.sep}`)) throw new Error(`Unsafe source path: ${id}`);
  await access(modelFile); await access(thumbFile);
  const modelBytes = await readFile(modelFile);
  const modelSha = sha256(modelBytes);
  if (modelSha !== evidenceById.get(id).canonicalSha256) throw new Error(`Canonical SHA mismatch: ${id}`);
  const thumbBytes = await readFile(thumbFile);
  records.push({ assetId: id, modelFile, modelSha, modelBytes: modelBytes.length, thumbFile, thumbSha: sha256(thumbBytes), thumbBytes: thumbBytes.length });
}
if (records.length !== 7 || new Set(records.map((record) => record.assetId)).size !== 7) throw new Error('M1A.1 requires exactly seven unique assets');

const manifest = { release: 'showcase-v1', assets: records.map(({ assetId, modelSha }) => ({ assetId, model: `models/${assetId}.glb`, thumbnail: `thumbs/${assetId}.png`, sha256: modelSha })) };
const manifestBytes = Buffer.from(pretty(manifest));
const payload = [
  ...records.map((record) => ({ key: `${release}/models/${record.assetId}.glb`, file: record.modelFile, bytes: record.modelBytes, sha256: record.modelSha, contentType: 'model/gltf-binary' })),
  ...records.map((record) => ({ key: `${release}/thumbs/${record.assetId}.png`, file: record.thumbFile, bytes: record.thumbBytes, sha256: record.thumbSha, contentType: 'image/png' })),
];
const manifestRecord = { key: `${release}/manifest.json`, file: null, bytes: manifestBytes.length, sha256: sha256(manifestBytes), contentType: 'application/json; charset=utf-8' };
const checksums = { release: 'showcase-v1', objects: Object.fromEntries([...payload, manifestRecord].map((entry) => [entry.key, { bytes: entry.bytes, sha256: entry.sha256 }])) };
const checksumsBytes = Buffer.from(pretty(checksums));
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'm1a-showcase-'));
const manifestFile = path.join(tempRoot, 'manifest.json');
const checksumsFile = path.join(tempRoot, 'checksums.json');
await writeFile(manifestFile, manifestBytes); await writeFile(checksumsFile, checksumsBytes);
manifestRecord.file = manifestFile;
const objects = [...payload, manifestRecord, { key: `${release}/checksums.json`, file: checksumsFile, bytes: checksumsBytes.length, sha256: sha256(checksumsBytes), contentType: 'application/json; charset=utf-8' }];
try {
  console.log(JSON.stringify({ bucket, release, objectCount: objects.length, objects: objects.map(({ key, bytes, sha256: hash }) => ({ key, bytes, sha256: hash })) }, null, 2));
  if (upload) {
    const states = [];
    for (const object of objects) {
      const remoteFile = path.join(tempRoot, `remote-${states.length}.bin`);
      const result = await remoteGet(object.key, remoteFile);
      if (result.code === 0) {
        const remoteBytes = await readFile(remoteFile);
        if (remoteBytes.length !== object.bytes || sha256(remoteBytes) !== object.sha256) throw new Error(`Immutable R2 collision at ${object.key}`);
        states.push('identical');
      } else if (isMissing(result)) states.push('missing');
      else throw new Error(`Could not inspect R2 object ${object.key}`);
    }
    const allIdentical = states.every((state) => state === 'identical');
    if (allIdentical) console.log('Exact existing showcase/v1 release verified; upload skipped.');
    else {
      for (const object of objects.slice(0, -1)) {
        if (states[objects.indexOf(object)] === 'identical') continue;
        const result = await run(process.execPath, [wrangler, 'r2', 'object', 'put', `${bucket}/${object.key}`, '--file', object.file, '--content-type', object.contentType, '--cache-control', 'public, max-age=31536000, immutable', '--remote']);
        if (result.code !== 0) throw new Error(`Upload failed: ${object.key}`);
      }
      const checksumState = states.at(-1);
      if (checksumState === 'identical') throw new Error('Refusing to finalize a partial release with an existing checksum object');
      const result = await run(process.execPath, [wrangler, 'r2', 'object', 'put', `${bucket}/${objects.at(-1).key}`, '--file', objects.at(-1).file, '--content-type', objects.at(-1).contentType, '--cache-control', 'public, max-age=31536000, immutable', '--remote']);
      if (result.code !== 0) throw new Error('Upload failed: showcase/v1/checksums.json');
      console.log('Uploaded showcase/v1 payload, manifest, then checksums last.');
    }
  }
  if (verify) {
    if (!origin) throw new Error('--origin or M1A_ASSET_ORIGIN is required for --verify');
    const parsed = new URL(origin); if (parsed.protocol !== 'https:') throw new Error('Public asset origin must use HTTPS');
    for (const object of objects) {
      const response = await fetch(`${origin}/${object.key}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || bytes.length !== object.bytes || sha256(bytes) !== object.sha256) throw new Error(`Public verification failed: ${object.key}`);
    }
    const root = await fetch(`${origin}/`); if (root.status === 200 && (await root.text()).includes('ListBucketResult')) throw new Error('Public asset origin exposes a directory listing');
    console.log(`Verified ${objects.length} public showcase/v1 objects over HTTPS.`);
  }
} finally { await rm(tempRoot, { recursive: true, force: true }); }
