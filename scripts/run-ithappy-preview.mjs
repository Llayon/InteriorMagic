import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cleanupIthappyLocalCatalog, repositoryRoot, stageIthappyLocalCatalog } from './ithappy-local-staging.mjs';

const require = createRequire(import.meta.url);
const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

const isPortAvailable = (port) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});

const findPort = async () => {
  for (let port = 4173; port < 4223; port += 1) if (await isPortAvailable(port)) return port;
  throw new Error('No available local preview port in range 4173-4222');
};

let server = null;
let stopPromise = null;
const stop = () => {
  if (stopPromise) return stopPromise;
  stopPromise = (async () => {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(false);
  }
  process.stdin.removeAllListeners('data');
  process.stdin.pause();
  process.stdin.unref?.();
  // SIGINT is not reliably delivered to a spawned Node child on Windows.
  // The launcher itself handles Ctrl+C, then terminates Vite before cleanup.
  if (server?.exitCode === null) server.kill('SIGTERM');
  await Promise.race([
    server && server.exitCode === null ? new Promise((resolve) => server.once('exit', resolve)) : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server?.exitCode === null) server.kill('SIGKILL');
  await cleanupIthappyLocalCatalog();
  })();
  return stopPromise;
};

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
if (process.stdin.isTTY) {
  process.stdin.setRawMode?.(true);
}
process.stdin.resume();
process.stdin.on('data', (data) => {
  if (data.includes(3)) void stop();
});

try {
  const staged = await stageIthappyLocalCatalog();
  const port = await findPort();
  const url = `http://127.0.0.1:${port}/?registry=ithappy`;
  server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--mode', 'test'], {
    cwd: repositoryRoot, env: process.env, stdio: 'inherit', shell: false, windowsHide: true,
  });
  console.log(`\nITHappy local catalog ready (${staged.catalogEntries} entries, ${staged.categories} categories):`);
  console.log(`${url}\n`);
  const exitCode = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => resolve(code));
  });
  if (!stopPromise && exitCode !== 0) process.exitCode = exitCode ?? 1;
} finally {
  await stop();
}
