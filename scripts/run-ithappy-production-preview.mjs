import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { repositoryRoot } from './ithappy-local-staging.mjs';

const publicOrigin = 'https://pub-6db83428342a40f7842dae4a7e41b009.r2.dev';
const assetOrigin = `${publicOrigin}/catalog/v1/`;
const placementMetadataUrl = `${publicOrigin}/preview/v1/prototype-placement.json`;
const require = createRequire(import.meta.url);
const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const playwrightCli = require.resolve('@playwright/test/cli');

const build = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run build'], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    VITE_BASE_PATH: '/InteriorMagic/',
    VITE_ITHAPPY_REMOTE_PREVIEW_ENABLED: 'true',
    VITE_ITHAPPY_ASSET_ORIGIN: assetOrigin,
    VITE_ITHAPPY_PREVIEW_PLACEMENT_URL: placementMetadataUrl,
  },
  stdio: 'inherit',
  shell: false,
});
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`Production preview build failed with code ${build.status}`);

const waitFor = async (url, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview server exited with code ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const preview = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: repositoryRoot,
  env: { ...process.env, VITE_BASE_PATH: '/InteriorMagic/' },
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});

try {
  await waitFor('http://127.0.0.1:4173/InteriorMagic/', preview);
  const tests = spawnSync(process.execPath, [playwrightCli, 'test', '--config=playwright.ithappy-remote.config.ts'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ITHAPPY_PREVIEW_ENABLED: 'true',
      ITHAPPY_TEST_ASSET_ORIGIN: assetOrigin,
      ITHAPPY_TEST_PREVIEW_PLACEMENT_URL: placementMetadataUrl,
      ITHAPPY_TEST_APP_PATH: '/InteriorMagic/',
      ITHAPPY_PRODUCTION_ARTIFACT: 'true',
    },
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  if (tests.error) throw tests.error;
  if (tests.status !== 0) process.exitCode = tests.status;
} finally {
  preview.kill();
}
