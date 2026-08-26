import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertRemoteMediaType } from './remote-media-type.mjs';
import { assertRemoteCors, requireRemoteVerificationOrigins } from './remote-verification.mjs';
import { loadValidatedReleaseObjects } from './release-files.mjs';

const root = process.cwd();
const revisionRoot = path.join(root, 'artifacts/ar0/sheen-chair/r1');
const cacheRoot = path.join(root, '.agent-data/ar0/r2-cache');
const prefix = 'ar0/sheen-chair/r1';
const publicOrigin = process.env.AR0_R2_PUBLIC_ORIGIN?.trim();
const appOrigin = process.env.AR0_APP_ORIGIN?.trim();
const upload = process.argv.includes('--upload');
const verify = process.argv.includes('--verify');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

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
  console.log(JSON.stringify({ prefix, mode: 'dry-run', objects: objects.map((object) => ({ path: object.path, bytes: object.bytes, sha256: object.sha256, contentType: object.contentType })) }, null, 2));
  process.exit(0);
}
if (upload) throw new Error('R2 PUBLISH PENDING: --upload is disabled until a conditional create-only publisher is available');

if (verify) {
  const origins = requireRemoteVerificationOrigins({ publicOrigin, appOrigin });
  const results = [];
  for (const object of objects) {
    const url = new URL(`${prefix}/${object.path}`, origins.publicOrigin.endsWith('/') ? origins.publicOrigin : `${origins.publicOrigin}/`);
    const response = await fetch(url, { headers: { Origin: origins.appOrigin } });
    const bytes = Buffer.from(await response.arrayBuffer());
    const record = { path: object.path, status: response.status, bytes: bytes.length, sha256: sha256(bytes), contentType: response.headers.get('content-type'), cors: response.headers.get('access-control-allow-origin') };
    if (!response.ok || record.bytes !== object.bytes || record.sha256 !== object.sha256) throw new Error(`Remote verification failed: ${JSON.stringify(record)}`);
    assertRemoteMediaType(object.path, record.contentType, object.contentType);
    assertRemoteCors(record.cors, origins.appOrigin);
    results.push(record);
  }
  await mkdir(cacheRoot, { recursive: true });
  await writeFile(path.join(cacheRoot, 'remote-verification.json'), `${JSON.stringify({ ...origins, results }, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
}
