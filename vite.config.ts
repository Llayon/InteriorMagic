import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const AR0_ROOTS = { r1: 'ar0/sheen-chair/r1', r2: 'ar0/sheen-chair/r2' } as const;
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
    const localAssetRoot = process.env.M1A_LOCAL_ASSET_ROOT
      ? path.resolve(process.env.M1A_LOCAL_ASSET_ROOT)
      : path.resolve(process.cwd(), '.agent-data', 'k1-production-assets');
    const canonicalRoot = path.join(localAssetRoot, 'canonical');
    const visualRoot = path.join(localAssetRoot, 'visual', 'canonical');
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

/**
 * DEV-ONLY: serves the experimental M1A quality-tier control GLBs from the
 * gitignored .agent-data/safari-gpu-investigation/ directory tree. Three URL
 * prefixes are mapped to the three tiers:
 *
 *   /__m1a_quality__/high/models/<id>.glb   -> .agent-data/.../canonical-snapshots/<id>.glb
 *   /__m1a_quality__/medium/models/<id>.glb -> .agent-data/.../control-1024/<id>.glb
 *   /__m1a_quality__/low/models/<id>.glb    -> .agent-data/.../control-512/<id>.glb
 *
 * The control GLBs are gitignored licensed bytes (R2-delivery preview only).
 * Never wire this plugin into a production build — the plugin is only
 * registered when the dev server is starting (mode !== 'production').
 */
const m1aQualityTierPlugin = (): Plugin => ({
  name: 'm1a-experimental-quality-tier',
  apply: 'serve',
  configureServer: (server) => {
    const investigationRoot = path.resolve(
      process.env.SAFARI_GPU_INVESTIGATION_ROOT
        ?? path.resolve(process.cwd(), '.agent-data', 'safari-gpu-investigation'),
    );
    const tierMap: Record<string, string> = {
      high: path.join(investigationRoot, 'canonical-snapshots'),
      medium: path.join(investigationRoot, 'control-1024'),
      low: path.join(investigationRoot, 'control-512'),
    };
    const middleware: Connect.NextHandleFunction = async (request, response, next) => {
      const pathname = decodeURIComponent(request.url?.split('?', 1)[0] ?? '');
      const match = pathname.match(/^\/__m1a_quality__\/(high|medium|low)\/models\/([^/]+)\.glb$/);
      if (!match) { next(); return; }
      const tier = match[1]!;
      const id = match[2]!;
      const filePath = path.join(tierMap[tier] ?? '', `${id}.glb`);
      try {
        await access(filePath);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'model/gltf-binary');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method === 'HEAD') { response.end(); return; }
        const stream = createReadStream(filePath);
        response.on('close', () => stream.destroy());
        stream.on('error', next).pipe(response);
      } catch {
        response.statusCode = 404;
        response.end(`M1A quality-tier file not found: ${filePath}`);
      }
    };
    server.middlewares.use(middleware);
  },
});

const ar0LocalAssetsPlugin = (enabled: boolean): Plugin => ({
  name: 'ar0-local-artifact-assets',
  configureServer: (server) => {
    if (!enabled) return;
    const middleware: Connect.NextHandleFunction = async (request, response, next) => {
      const pathname = decodeURIComponent(request.url?.split('?', 1)[0] ?? '');
      const match = pathname.match(/^\/ar0\/sheen-chair\/(r1|r2)\/([^/]+)$/);
      const entry = match ? AR0_FILES[match[2]] : undefined;
      if (!entry) { next(); return; }
      const artifactRoot = path.resolve(process.cwd(), 'artifacts', AR0_ROOTS[match![1] as keyof typeof AR0_ROOTS]);
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
  const m1aShowcaseEnabled = env.VITE_M1A_SHOWCASE_ENABLED === 'true';
  const m1aAssetOrigin = env.VITE_M1A_ASSET_ORIGIN?.trim();
  if (mode === 'production' && ar0Enabled && !assetOrigin) {
    throw new Error('VITE_AR_ASSET_ORIGIN is required when VITE_AR0_ENABLED=true in production');
  }
  if (mode === 'production' && ar0Enabled && assetOrigin) {
    const parsed = new URL(assetOrigin);
    if (parsed.protocol !== 'https:') throw new Error('VITE_AR_ASSET_ORIGIN must use HTTPS in production');
  }
  if (mode === 'production' && m1aShowcaseEnabled && !m1aAssetOrigin) throw new Error('VITE_M1A_ASSET_ORIGIN is required when VITE_M1A_SHOWCASE_ENABLED=true in production');
  if (mode === 'production' && m1aAssetOrigin) {
    const parsed = new URL(m1aAssetOrigin);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('VITE_M1A_ASSET_ORIGIN must be an HTTPS origin without a path');
  }
  return {
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [ar0LocalAssetsPlugin(mode !== 'production'), m1aLocalAssetsPlugin(mode !== 'production'), m1aQualityTierPlugin(), react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { target: 'es2020', sourcemap: true },
  };
});
