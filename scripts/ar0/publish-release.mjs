import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertRemoteMediaType } from './remote-media-type.mjs';
import { loadValidatedReleaseObjects } from './release-files.mjs';
import { planImmutableUpload } from './immutable-upload-plan.mjs';

const root = process.cwd();
const revisionRoot = path.join(root, 'public/ar0/sheen-chair/r1');
const cacheRoot = path.join(root, '.agent-data/ar0/r2-cache');
const bucket = process.env.AR0_R2_BUCKET?.trim() || 'interiormagic-assets';
const prefix = 'ar0/sheen-chair/r1';
const publicOrigin = process.env.AR0_R2_PUBLIC_ORIGIN?.trim();
const appOrigin = process.env.AR0_APP_ORIGIN?.trim();
const upload = process.argv.includes('--upload');
const verify = process.argv.includes('--verify');
const hasNonInteractiveAuth = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);
const wrangler = require.resolve('wrangler');

const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, env: process.env, shell: false, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('exit', (code) => resolve({ code, stdout, stderr }));
});

const { objects } = await loadValidatedReleaseObjects(revisionRoot);

const validateLocalStage = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts/ar0/validate-revision.mjs'), '--staged'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Staged AR0 validation failed with code ${code}`)));
});

await validateLocalStage();

if (!upload && !verify) {
  console.log(JSON.stringify({ bucket, prefix, mode: 'dry-run', objects: objects.map((object) => ({ path: object.path, bytes: object.bytes, sha256: object.sha256, contentType: object.contentType })) }, null, 2));
  process.exit(0);
}
if (upload && !hasNonInteractiveAuth) throw new Error('R2 PUBLISH PENDING: non-interactive CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID are unavailable');

if (upload) {
  await mkdir(cacheRoot, { recursive: true });
  const statuses = [];
  for (const object of objects) {
    const remoteFile = path.join(cacheRoot, object.path.replaceAll('/', '_'));
    const result = await run(['r2', 'object', 'get', `${bucket}/${prefix}/${object.path}`, '--file', remoteFile, '--remote']);
    if (result.code === 0) {
      const remoteBytes = await readFile(remoteFile);
      statuses.push({ path: object.path, exists: true, identical: remoteBytes.length === object.bytes && sha256(remoteBytes) === object.sha256 });
    } else if (/not found|does not exist|no such key|10007/iu.test(`${result.stdout}\n${result.stderr}`)) {
      statuses.push({ path: object.path, exists: false, identical: false });
    } else {
      throw new Error(`Could not preflight ${prefix}/${object.path}: ${result.stderr || result.stdout}`);
    }
  }
  const ordered = planImmutableUpload(objects, statuses);
  for (const object of ordered) {
    const result = await run(['r2', 'object', 'put', `${bucket}/${prefix}/${object.path}`, '--file', object.localFile, '--content-type', object.contentType, '--cache-control', 'public, max-age=31536000, immutable', '--storage-class', 'Standard', '--remote']);
    if (result.code !== 0) throw new Error(`R2 PUT failed for ${prefix}/${object.path}: ${result.stderr || result.stdout}`);
  }
  console.log(`Published ${ordered.length} new immutable objects; ${objects.length - ordered.length} were already identical.`);
}

if (verify) {
  if (!publicOrigin) throw new Error('AR0_R2_PUBLIC_ORIGIN is required for remote verification');
  const results = [];
  for (const object of objects) {
    const url = new URL(`${prefix}/${object.path}`, publicOrigin.endsWith('/') ? publicOrigin : `${publicOrigin}/`);
    const response = await fetch(url, { headers: appOrigin ? { Origin: appOrigin } : undefined });
    const bytes = Buffer.from(await response.arrayBuffer());
    const record = { path: object.path, status: response.status, bytes: bytes.length, sha256: sha256(bytes), contentType: response.headers.get('content-type'), cors: response.headers.get('access-control-allow-origin') };
    if (!response.ok || record.bytes !== object.bytes || record.sha256 !== object.sha256) throw new Error(`Remote verification failed: ${JSON.stringify(record)}`);
    assertRemoteMediaType(object.path, record.contentType, object.contentType);
    if (appOrigin && record.cors !== '*' && record.cors !== appOrigin) throw new Error(`Remote CORS does not allow ${appOrigin}`);
    results.push(record);
  }
  await mkdir(cacheRoot, { recursive: true });
  await writeFile(path.join(cacheRoot, 'remote-verification.json'), `${JSON.stringify({ publicOrigin, appOrigin, results }, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
}
