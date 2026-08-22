import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const wrangler = require.resolve('wrangler');
const bucket = process.argv[2] || 'interiormagic-assets';
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error(`Invalid bucket: ${bucket}`);

const run = (args, allowFailure = false) => {
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: repositoryRoot, stdio: 'inherit', shell: false });
  if (!allowFailure && result.status !== 0) throw new Error(`Wrangler failed: ${args.join(' ')}`);
  return result.status ?? 1;
};

run(['r2', 'bucket', 'list']);
const exists = run(['r2', 'bucket', 'info', bucket], true) === 0;
if (!exists) run(['r2', 'bucket', 'create', bucket, '--storage-class', 'Standard']);
run(['r2', 'bucket', 'cors', 'set', bucket, '--file', path.join(repositoryRoot, 'scripts', 'ithappy-r2-cors.json')]);
run(['r2', 'bucket', 'cors', 'list', bucket]);
run(['r2', 'bucket', 'dev-url', 'enable', bucket]);
run(['r2', 'bucket', 'dev-url', 'get', bucket]);
