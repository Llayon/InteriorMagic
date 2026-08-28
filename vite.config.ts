import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const AR0_ROOT = 'ar0/sheen-chair/r1';
const AR0_FILES: Record<string, { file: string; contentType: string }> = {
  'model.glb': { file: 'model.glb', contentType: 'model/gltf-binary' },
  'model.usdz': { file: 'model.usdz', contentType: 'model/vnd.usdz+zip' },
  'poster.webp': { file: 'poster.webp', contentType: 'image/webp' },
  'manifest.json': { file: 'manifest.json', contentType: 'application/json; charset=utf-8' },
  'checksums.json': { file: 'checksums.json', contentType: 'application/json; charset=utf-8' },
};

const M1A_MODELS: Record<string, string> = {
  carpet: 'carpet.glb', chair: 'chair.glb', coffee_table_026: 'coffee_table_026.glb', dresser_001: 'dresser_001.glb',
  electronics: 'electronics.glb', lamp: 'lamp.glb', sofa_030: 'sofa_030.glb',
};
const M1A_THUMBS: Record<string, string> = {
  carpet: 'carpet__+Z.png', chair: 'chair__+Z.png', coffee_table_026: 'coffee_table_026__+Z.png', dresser_001: 'dresser_001__+Z.png',
  electronics: 'electronics__+Z.png', lamp: 'lamp__+Z.png', sofa_030: 'sofa_030__+Z.png',
};

const m1aLocalAssetsPlugin = (enabled: boolean): Plugin => ({
  name: 'm1a-private-showcase-assets',
  configureServer: (server) => {
    if (!enabled) return;
    const canonicalRoot = path.resolve(process.cwd(), '.agent-data', 'k1-production-assets', 'canonical');
    const visualRoot = path.resolve(process.cwd(), '.agent-data', 'k1-production-assets', 'visual', 'canonical');
    const middleware: Connect.NextHandleFunction = async (request, response, next) => {
      const pathname = decodeURIComponent(request.url?.split('?', 1)[0] ?? '');
      const model = pathname.match(/^\/__m1a_assets__\/models\/([^/]+)\.glb$/);
      const thumb = pathname.match(/^\/__m1a_assets__\/thumbs\/([^/]+)\.png$/);
      const id = model?.[1] ?? thumb?.[1];
      const file = model ? M1A_MODELS[id ?? ''] : thumb ? M1A_THUMBS[id ?? ''] : undefined;
      if (!file) { if (pathname.startsWith('/__m1a_assets__/')) { response.statusCode = 404; response.end('Not found'); return; } next(); return; }
      const filePath = path.join(model ? canonicalRoot : visualRoot, file);
      try {
        await access(filePath);
        response.statusCode = 200;
        response.setHeader('Content-Type', model ? 'model/gltf-binary' : 'image/png');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method === 'HEAD') { response.end(); return; }
        const stream = createReadStream(filePath);
        response.on('close', () => stream.destroy());
        stream.on('error', next).pipe(response);
      } catch { response.statusCode = 404; response.end('Not found'); }
    };
    server.middlewares.use(middleware);
  },
});

const ar0LocalAssetsPlugin = (enabled: boolean): Plugin => ({
  name: 'ar0-local-artifact-assets',
  configureServer: (server) => {
    if (!enabled) return;
    const artifactRoot = path.resolve(process.cwd(), 'artifacts', AR0_ROOT);
    const middleware: Connect.NextHandleFunction = async (request, response, next) => {
      const pathname = decodeURIComponent(request.url?.split('?', 1)[0] ?? '');
      const match = pathname.match(/^\/ar0\/sheen-chair\/r1\/([^/]+)$/);
      const entry = match ? AR0_FILES[match[1]] : undefined;
      if (!entry) { next(); return; }
      const filePath = path.join(artifactRoot, entry.file);
      try {
        await access(filePath);
        response.statusCode = 200;
        response.setHeader('Content-Type', entry.contentType);
        response.setHeader('Cache-Control', 'no-store');
        if (request.method === 'HEAD') { response.end(); return; }
        const stream = createReadStream(filePath);
        response.on('close', () => stream.destroy());
        stream.on('error', next).pipe(response);
      } catch {
        response.statusCode = 404;
        response.end('Not found');
      }
    };
    server.middlewares.use(middleware);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ar0Enabled = env.VITE_AR0_ENABLED === 'true';
  const assetOrigin = env.VITE_AR_ASSET_ORIGIN?.trim();
  if (mode === 'production' && ar0Enabled && !assetOrigin) {
    throw new Error('VITE_AR_ASSET_ORIGIN is required when VITE_AR0_ENABLED=true in production');
  }
  if (mode === 'production' && ar0Enabled && assetOrigin) {
    const parsed = new URL(assetOrigin);
    if (parsed.protocol !== 'https:') throw new Error('VITE_AR_ASSET_ORIGIN must use HTTPS in production');
  }
  return {
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [ar0LocalAssetsPlugin(mode !== 'production'), m1aLocalAssetsPlugin(mode !== 'production'), react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { target: 'es2020', sourcemap: true },
  };
});
