import { createServer } from 'vite';

process.env.VITE_AR0_ENABLED = 'true';

const server = await createServer({
  mode: 'test',
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});

await server.listen();

const close = async () => {
  await server.close();
  process.exit(0);
};
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
