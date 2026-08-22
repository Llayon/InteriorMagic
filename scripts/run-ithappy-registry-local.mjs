import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cleanupIthappyLocalCatalog, repositoryRoot, stageIthappyLocalCatalog } from './ithappy-local-staging.mjs';

const require = createRequire(import.meta.url);
const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const waitForServer = async (server) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with code ${server.exitCode}`);
    try { const response = await fetch('http://127.0.0.1:4173'); if (response.ok) return; } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for local Vite server');
};

let server = null;
let serverExit = null;
try {
  await stageIthappyLocalCatalog();
  server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '4173', '--strictPort', '--mode', 'test'], {
    cwd: repositoryRoot, env: process.env, stdio: 'inherit', shell: false, windowsHide: true,
  });
  serverExit = new Promise((resolve) => server.once('exit', resolve));
  await waitForServer(server);
  const playwrightCli = require.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [playwrightCli, 'test', '--config=playwright.ithappy-catalog.config.ts'], {
    cwd: repositoryRoot, env: process.env, stdio: 'inherit', shell: false, timeout: 900_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  if (server) {
    server.kill();
    await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await cleanupIthappyLocalCatalog();
}
