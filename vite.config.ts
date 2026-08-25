import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const ar0MimeMiddleware: Connect.NextHandleFunction = (request, response, next) => {
  const pathname = request.url?.split('?', 1)[0]?.toLowerCase();
  if (pathname?.endsWith('.usdz')) response.setHeader('Content-Type', 'model/vnd.usdz+zip');
  if (pathname?.endsWith('.glb')) response.setHeader('Content-Type', 'model/gltf-binary');
  next();
};

const ar0MimePlugin = (): Plugin => ({
  name: 'ar0-model-mime',
  configureServer: (server) => { server.middlewares.use(ar0MimeMiddleware); },
  configurePreviewServer: (server) => { server.middlewares.use(ar0MimeMiddleware); },
});

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [ar0MimePlugin(), react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2020', sourcemap: true },
});
