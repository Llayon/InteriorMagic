import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { assertRemoteCors } from './remote-verification.mjs';
import { assertRemoteMediaType } from './remote-media-type.mjs';
import { loadValidatedReleaseObjects } from './release-files.mjs';
import { planImmutableUpload } from './immutable-upload-plan.mjs';
import { parseAr0RevisionArgument } from './revision-config.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const revision = parseAr0RevisionArgument(args);
const revisionRoot = path.join(root, 'artifacts', 'ar0', 'sheen-chair', revision.artifactDirectory);
const prefix = `ar0/sheen-chair/${revision.artifactDirectory}`;
const bucket = process.env.AR0_R2_BUCKET?.trim() || 'interiormagic-assets';
const publicOrigin = process.env.AR0_R2_PUBLIC_ORIGIN?.trim();
const appOrigin = process.env.AR0_APP_ORIGIN?.trim();
const upload = args.includes('--upload');
const verify = args.includes('--verify');
const allowedArguments = new Set(['--upload', '--verify', '--revision', revision.arRevisionId]);
if (args.some((arg) => !allowedArguments.has(arg))) throw new Error('Unsupported AR0 publisher argument');
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error(`Invalid bucket: ${bucket}`);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wrangler = createRequire(import.meta.url).resolve('wrangler');
const run = (commandArgs, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [wrangler, ...commandArgs], {
    cwd: root,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  let completionObserved = false;
  let settled = false;
  const completionPattern = commandArgs[2] === 'get' ? /Download complete\./u : commandArgs[2] === 'put' ? /Upload complete\./u : null;
  const consume = (stream, chunk) => {
    const value = chunk.toString();
    if (stream === 'stdout') stdout += value;
    else stderr += value;
    if (!capture) (stream === 'stdout' ? process.stdout : process.stderr).write(chunk);
    if (!completionObserved && completionPattern?.test(`${stdout}\n${stderr}`)) {
      completionObserved = true;
      // Wrangler 4.125 can retain an HTTP keep-alive handle on Windows after
      // reporting a completed R2 transfer. The exact HTTPS verification below
      // remains authoritative; this only bounds the already-complete CLI child.
      setTimeout(() => { if (!settled) child.kill(); }, 500).unref();
    }
  };
  child.stdout.on('data', (chunk) => consume('stdout', chunk));
  child.stderr.on('data', (chunk) => consume('stderr', chunk));
  child.once('error', reject);
  child.once('close', (code) => {
    settled = true;
    resolve({ code: completionObserved ? 0 : code ?? 1, stdout, stderr });
  });
});
const isMissing = (result) => /not found|does not exist|no such key|10007/i.test(`${result.stdout}\n${result.stderr}`);
const remoteOrigin = () => {
  if (!publicOrigin) throw new Error('AR0_R2_PUBLIC_ORIGIN is required for remote verification');
  if (!appOrigin) throw new Error('AR0_APP_ORIGIN is required for remote verification');
  const parsed = new URL(publicOrigin);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('AR0_R2_PUBLIC_ORIGIN must be an HTTPS origin without a path');
  return publicOrigin.replace(/\/+$/, '');
};

const { objects } = await loadValidatedReleaseObjects(revisionRoot, revision.arRevisionId);
if (objects.length !== 5 || new Set(objects.map((object) => object.path)).size !== 5) throw new Error(`${revision.arRevisionId} requires exactly five release objects`);
const tempRoot = await mkdtemp(path.join(os.tmpdir(), `${revision.arRevisionId}-publish-`));
const plan = objects.map((object) => ({ ...object, key: `${prefix}/${object.path}` }));
console.log(JSON.stringify({ bucket, prefix: `${prefix}/`, objectCount: plan.length, objects: plan.map(({ key, bytes, sha256: hash, contentType }) => ({ key, bytes, sha256: hash, contentType })) }, null, 2));
const remoteGet = (key, file) => run(['r2', 'object', 'get', `${bucket}/${key}`, '--file', file, '--remote'], true);
const uploadObject = (object) => run(['r2', 'object', 'put', `${bucket}/${object.key}`, '--file', object.localFile, '--content-type', object.contentType, '--cache-control', 'public, max-age=31536000, immutable', '--remote']);

try {
  if (upload) {
    const statuses = [];
    for (const [index, object] of plan.entries()) {
      const remoteFile = path.join(tempRoot, `remote-${index}.bin`);
      const result = await remoteGet(object.key, remoteFile);
      if (result.code === 0) {
        const bytes = await readFile(remoteFile);
        if (bytes.length !== object.bytes || sha256(bytes) !== object.sha256) throw new Error(`Immutable R2 collision at ${object.key}`);
        statuses.push({ path: object.path, exists: true, identical: true });
      } else if (isMissing(result)) statuses.push({ path: object.path, exists: false, identical: false });
      else throw new Error(`Could not inspect R2 object ${object.key}: ${result.stderr || result.stdout}`);
    }
    const missing = planImmutableUpload(plan, statuses);
    if (missing.length === 0) console.log(`Exact existing ${prefix}/ release verified; upload skipped.`);
    else {
      for (const object of missing.filter((entry) => entry.path !== 'checksums.json')) {
        const result = await uploadObject(object);
        if (result.code !== 0) throw new Error(`Upload failed: ${object.key}`);
      }
      const checksums = missing.find((entry) => entry.path === 'checksums.json');
      if (checksums) {
        const result = await uploadObject(checksums);
        if (result.code !== 0) throw new Error(`Upload failed: ${checksums.key}`);
      }
      console.log(`Uploaded ${prefix}/ payload, then checksums.json last.`);
    }
  }
  if (verify) {
    const origin = remoteOrigin();
    const results = [];
    for (const object of plan) {
      const response = await fetch(`${origin}/${object.key}`, { headers: { Origin: appOrigin } });
      const bytes = Buffer.from(await response.arrayBuffer());
      const record = { key: object.key, status: response.status, bytes: bytes.length, sha256: sha256(bytes), contentType: response.headers.get('content-type'), cors: response.headers.get('access-control-allow-origin') };
      if (!response.ok || record.bytes !== object.bytes || record.sha256 !== object.sha256) throw new Error(`Remote verification failed: ${JSON.stringify(record)}`);
      assertRemoteMediaType(object.path, record.contentType, object.contentType);
      assertRemoteCors(record.cors, appOrigin);
      results.push(record);
    }
    console.log(JSON.stringify(results, null, 2));
    console.log(`Verified ${results.length}/5 ${revision.arRevisionId} objects over HTTPS with exact bytes, hashes, media types, and CORS.`);
  }
} finally { await rm(tempRoot, { recursive: true, force: true }); }
