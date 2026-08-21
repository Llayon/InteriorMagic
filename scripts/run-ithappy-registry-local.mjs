import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const pipelineRoot = path.resolve(process.env.ITHAPPY_PIPELINE_ROOT || path.join(repositoryRoot, '..', '..', '.agent-data', 'ithappy-production-pipeline'));
const stagingRoot = path.resolve(repositoryRoot, 'public', '.local-assets', 'ithappy-registry');
const permittedRoot = path.resolve(repositoryRoot, 'public', '.local-assets');
const assetIds = ['sofa_037', 'chair_024', 'lamp_048'];

if (!stagingRoot.startsWith(`${permittedRoot}${path.sep}`)) throw new Error(`Unsafe staging path: ${stagingRoot}`);

const stage = async () => {
  const manifestPath = path.join(pipelineRoot, 'manifests', 'runtime-catalog.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length !== 836) throw new Error(`Expected 836 runtime catalog entries, received ${Array.isArray(manifest) ? manifest.length : 'invalid manifest'}`);
  await mkdir(path.join(stagingRoot, 'runtime-assets'), { recursive: true });
  await cp(manifestPath, path.join(stagingRoot, 'runtime-catalog.json'));
  for (const id of assetIds) await cp(path.join(pipelineRoot, 'runtime-assets', `${id}.glb`), path.join(stagingRoot, 'runtime-assets', `${id}.glb`));
};

await stage();
try {
  const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [playwrightCli, 'test', 'tests/e2e/ithappy-registry.spec.ts', '--project=mobile-small'], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
