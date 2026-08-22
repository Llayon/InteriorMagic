import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { cleanupIthappyLocalCatalog, repositoryRoot, stageIthappyPrototypePlacement } from './ithappy-local-staging.mjs';

const dataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data');
const releaseRoot = path.join(dataRoot, 'ithappy-r2-delivery', 'deployment', 'catalog', 'v1');
const runtimeRoot = path.join(dataRoot, 'ithappy-production-pipeline', 'runtime-assets');
const thumbnailRoot = path.join(dataRoot, 'ithappy-catalog-build', 'thumbnails');
const require = createRequire(import.meta.url);
const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const playwrightCli = require.resolve('@playwright/test/cli');
const configuredRemoteOrigin = process.env.ITHAPPY_TEST_ASSET_ORIGIN;
const assetOrigin = configuredRemoteOrigin ? `${configuredRemoteOrigin.replace(/\/+$/, '')}/` : 'http://127.0.0.1:4174/catalog/v1/';
const usesLocalAssetServer = assetOrigin.startsWith('http://127.0.0.1:4174/');

const resolveRequest = (pathname) => {
  const prefix = '/catalog/v1/';
  if (!pathname.startsWith(prefix)) return null;
  const relative = decodeURIComponent(pathname.slice(prefix.length));
  if (relative.includes('..') || relative.includes('\\')) return null;
  if (/^runtime\/[a-z0-9_]+\.glb$/.test(relative)) return { file: path.join(runtimeRoot, path.basename(relative)), type: 'model/gltf-binary' };
  if (/^thumbnails\/[a-z0-9_]+\.webp$/.test(relative)) return { file: path.join(thumbnailRoot, path.basename(relative)), type: 'image/webp' };
  if (/^(runtime-catalog|catalog-payload|checksums)\.json$/.test(relative)) return { file: path.join(releaseRoot, relative), type: 'application/json; charset=utf-8' };
  return null;
};

const assetServer = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin || 'http://127.0.0.1:4173');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    response.writeHead(204).end();
    return;
  }
  const resolved = resolveRequest(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  if (!resolved || !['GET', 'HEAD'].includes(request.method || '')) { response.writeHead(404).end(); return; }
  try {
    const details = await stat(resolved.file);
    response.setHeader('Content-Type', resolved.type);
    response.setHeader('Content-Length', details.size);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin || 'http://127.0.0.1:4173');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (request.method === 'HEAD') { response.writeHead(200).end(); return; }
    response.writeHead(200); createReadStream(resolved.file).pipe(response);
  } catch { response.writeHead(404).end(); }
});

const waitFor = async (url, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
};
const runChild = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, options);
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

let vite = null;
try {
  const preparation = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'ithappy-r2-delivery.mjs'), '--release', 'v1'], { cwd: repositoryRoot, stdio: 'inherit', shell: false });
  if (preparation.error) throw preparation.error;
  if (preparation.status !== 0) throw new Error(`R2 release preparation failed with code ${preparation.status}`);
  await stageIthappyPrototypePlacement();
  if (usesLocalAssetServer) await new Promise((resolve, reject) => assetServer.once('error', reject).listen(4174, '127.0.0.1', resolve));
  vite = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '4173', '--strictPort', '--mode', 'test'], {
    cwd: repositoryRoot, env: { ...process.env, VITE_ITHAPPY_ASSET_ORIGIN: assetOrigin }, stdio: 'inherit', shell: false, windowsHide: true,
  });
  await waitFor('http://127.0.0.1:4173', vite);
  const status = await runChild(process.execPath, [playwrightCli, 'test', '--config=playwright.ithappy-remote.config.ts'], { cwd: repositoryRoot, env: process.env, stdio: 'inherit', shell: false, windowsHide: true });
  if (status !== 0) process.exitCode = status;
} finally {
  if (vite) vite.kill();
  if (usesLocalAssetServer) await new Promise((resolve) => assetServer.close(resolve));
  await cleanupIthappyLocalCatalog();
}
