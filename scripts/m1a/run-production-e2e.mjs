import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const origin = process.env.M1A_TEST_ASSET_ORIGIN || 'https://pub-6db83428342a40f7842dae4a7e41b009.r2.dev';
if (!origin.startsWith('https://')) throw new Error('M1A_TEST_ASSET_ORIGIN must use HTTPS');
const env = { ...process.env, VITE_M1A_SHOWCASE_ENABLED: 'true', VITE_M1A_ASSET_ORIGIN: origin };
const npm = process.platform === 'win32' ? process.env.ComSpec : 'npm';
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env: options.env || env, stdio: 'inherit', shell: false, windowsHide: true });
  child.on('error', reject); child.on('close', (code) => resolve(code ?? 1));
});
if (await run(npm, process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build']) !== 0) throw new Error('Production showcase build failed');
const require = createRequire(import.meta.url);
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const preview = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { cwd: root, env, stdio: 'inherit', shell: false, windowsHide: true });
try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch('http://127.0.0.1:4175/')).ok) break; } catch { /* preview is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const playwright = require.resolve('@playwright/test/cli');
  const code = await run(process.execPath, [playwright, 'test', '--config=playwright.showcase-production.config.ts'], { env: { ...process.env, M1A_TEST_ASSET_ORIGIN: origin } });
  if (code !== 0) process.exitCode = code;
} finally { preview.kill(); }
