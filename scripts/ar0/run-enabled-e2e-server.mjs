import { createServer } from 'vite';

process.env.VITE_AR0_ENABLED = 'true';

const server = await createServer({
  mode: 'test',
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});

await server.listen();

let stopPromise = null;
const close = async () => {
  if (stopPromise) return stopPromise;
  stopPromise = (async () => {
    // Playwright's Windows process-tree termination can leave a Vite child
    // alive unless stdin/signal cleanup is explicit. Bound shutdown so an
    // aborted model request cannot keep the E2E command open indefinitely.
    process.stdin.pause();
    process.stdin.unref?.();
    await Promise.race([
      server.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  })();
  await stopPromise;
  process.exit(0);
};
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
process.stdin.resume();
process.stdin.on('data', (data) => { if (data.includes(3)) void close(); });
