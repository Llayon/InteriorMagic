import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIthappyPrototypePlacement } from './ithappy-local-staging.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputFile = path.resolve(repositoryRoot, '..', '..', '.agent-data', 'ithappy-r2-delivery', 'deployment', 'preview', 'v1', 'prototype-placement.json');
const remoteKey = 'preview/v1/prototype-placement.json';
const bucket = 'interiormagic-assets';
const args = process.argv.slice(2);
const shouldUpload = args.includes('--upload');
const shouldVerify = args.includes('--verify');
const publicOrigin = process.env.ITHAPPY_R2_PUBLIC_ORIGIN?.replace(/\/+$/, '');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const document = await buildIthappyPrototypePlacement();
if (document.provenance !== 'prototype-raw-scene-bounds-not-production-metadata' || document.purpose !== 'remote-preview-only') throw new Error('Invalid preview placement provenance');
const ids = Object.keys(document.assets);
if (ids.length !== 500) throw new Error(`Expected 500 preview-placeable assets, received ${ids.length}`);
for (const [id, value] of Object.entries(document.assets)) {
  if (!/^[a-z0-9_]+$/.test(id) || !value || Object.keys(value).join(',') !== 'dimensions') throw new Error(`Invalid preview record: ${id}`);
  const dimensions = value.dimensions;
  if (Object.keys(dimensions).sort().join(',') !== 'depth,height,width' || !Object.values(dimensions).every((number) => Number.isFinite(number) && number > 0)) throw new Error(`Invalid preview dimensions: ${id}`);
}
const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
const text = bytes.toString('utf8');
if (/[a-z]:\\|[a-z]:\/|Programms|\.agent-data|runtime-assets|sourceTexture|credential|token/i.test(text)) throw new Error('Preview metadata contains forbidden private/source data');
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, bytes);
console.log(JSON.stringify({ remoteKey, records: ids.length, bytes: bytes.length, sha256: sha256(bytes), provenance: document.provenance, purpose: document.purpose }, null, 2));

if (shouldUpload) {
  const wrangler = createRequire(import.meta.url).resolve('wrangler');
  const result = spawnSync(process.execPath, [wrangler, 'r2', 'object', 'put', `${bucket}/${remoteKey}`, '--file', outputFile, '--content-type', 'application/json; charset=utf-8', '--cache-control', 'public, max-age=300', '--storage-class', 'Standard', '--remote', '--force'], { cwd: repositoryRoot, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Preview metadata upload failed with code ${result.status}`);
}

if (shouldVerify) {
  if (!publicOrigin) throw new Error('ITHAPPY_R2_PUBLIC_ORIGIN is required for verification');
  const response = await fetch(`${publicOrigin}/${remoteKey}`, { headers: { Origin: 'https://llayon.github.io' } });
  const remoteBytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || sha256(remoteBytes) !== sha256(bytes)) throw new Error('Remote preview placement integrity failed');
  console.log(JSON.stringify({ status: response.status, contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control'), allowOrigin: response.headers.get('access-control-allow-origin'), bytes: remoteBytes.length, sha256: sha256(remoteBytes) }, null, 2));
}
