import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.self = globalThis;

export const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data');
const pipelineRoot = path.resolve(process.env.ITHAPPY_PIPELINE_ROOT || path.join(dataRoot, 'ithappy-production-pipeline'));
const catalogBuildRoot = path.resolve(process.env.ITHAPPY_CATALOG_BUILD_ROOT || path.join(dataRoot, 'ithappy-catalog-build'));
export const stagingRoot = path.resolve(repositoryRoot, 'public', '.local-assets', 'ithappy-registry');
const permittedRoot = path.resolve(repositoryRoot, 'public', '.local-assets');
const placementEnabledCategories = new Set(['Seating', 'Tables', 'Storage', 'Lighting', 'Plants', 'Decor']);
const expectedCategories = { Seating: 86, Tables: 38, Storage: 107, Bedroom: 23, Lighting: 19, Plants: 19, Decor: 231, 'Kitchen & Bath': 127, Architecture: 186 };

if (!stagingRoot.startsWith(`${permittedRoot}${path.sep}`)) throw new Error(`Unsafe staging path: ${stagingRoot}`);

const inspectBounds = async (runtimeRoot, assetIds) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const assets = {};
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => { if (!String(args[0]).startsWith("THREE.GLTFLoader: Couldn't load texture")) originalWarn(...args); };
  console.error = (...args) => { if (!String(args[0]).startsWith("THREE.GLTFLoader: Couldn't load texture")) originalError(...args); };
  try {
    for (const id of assetIds) {
      const bytes = await readFile(path.join(runtimeRoot, `${id}.glb`));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await loader.parseAsync(buffer, '');
      gltf.scene.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) throw new Error(`Invalid local prototype bounds: ${id}`);
      assets[id] = { dimensions: { width: size.x, height: size.y, depth: size.z } };
    }
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
  return { provenance: 'prototype-raw-scene-bounds-not-production-metadata', assets };
};

const validatePayload = async (manifest, payload, runtimeRoot, thumbnailRoot) => {
  if (!Array.isArray(manifest) || manifest.length !== 836) throw new Error(`Expected 836 runtime entries, received ${Array.isArray(manifest) ? manifest.length : 'invalid manifest'}`);
  if (!Array.isArray(payload) || payload.length !== 836) throw new Error(`Expected 836 catalog entries, received ${Array.isArray(payload) ? payload.length : 'invalid payload'}`);
  const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
  const ids = new Set();
  const counts = {};
  for (const entry of payload) {
    if (ids.has(entry.assetId)) throw new Error(`Duplicate catalog ID: ${entry.assetId}`);
    ids.add(entry.assetId);
    counts[entry.displayCategory] = (counts[entry.displayCategory] || 0) + 1;
    const runtime = manifestById.get(entry.assetId);
    if (!runtime || runtime.runtimeFilename !== entry.runtimeFilename || runtime.category !== entry.sourceCategory) throw new Error(`Catalog/runtime mismatch: ${entry.assetId}`);
    if ([entry.runtimeFilename, entry.thumbnailFilename].some((filename) => typeof filename !== 'string' || filename.includes('\\') || filename.includes('..') || filename.includes('://') || /^[a-z]:/i.test(filename))) throw new Error(`Unsafe catalog path: ${entry.assetId}`);
    await access(path.join(runtimeRoot, `${entry.assetId}.glb`));
    await access(path.join(thumbnailRoot, `${entry.assetId}.webp`));
  }
  for (const [category, expected] of Object.entries(expectedCategories)) if (counts[category] !== expected) throw new Error(`Category count mismatch ${category}: ${counts[category]}/${expected}`);
  return payload.filter((entry) => placementEnabledCategories.has(entry.displayCategory)).map((entry) => entry.assetId);
};

export const cleanupIthappyLocalCatalog = () => rm(stagingRoot, { recursive: true, force: true });

export const stageIthappyPrototypePlacement = async () => {
  const manifestPath = path.join(pipelineRoot, 'manifests', 'runtime-catalog.json');
  const payloadPath = path.join(catalogBuildRoot, 'manifests', 'catalog-payload.json');
  const runtimeRoot = path.join(pipelineRoot, 'runtime-assets');
  const thumbnailRoot = path.join(catalogBuildRoot, 'thumbnails');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  const placementIds = await validatePayload(manifest, payload, runtimeRoot, thumbnailRoot);
  if (placementIds.length !== 500) throw new Error(`Unexpected prototype placement scale: ${placementIds.length}`);
  await cleanupIthappyLocalCatalog();
  await mkdir(stagingRoot, { recursive: true });
  await writeFile(path.join(stagingRoot, 'prototype-placement.json'), JSON.stringify(await inspectBounds(runtimeRoot, placementIds)));
  console.log(`Staged local-only prototype placement metadata for ${placementIds.length} assets.`);
};

export const stageIthappyLocalCatalog = async () => {
  const manifestPath = path.join(pipelineRoot, 'manifests', 'runtime-catalog.json');
  const payloadPath = path.join(catalogBuildRoot, 'manifests', 'catalog-payload.json');
  const runtimeRoot = path.join(pipelineRoot, 'runtime-assets');
  const thumbnailRoot = path.join(catalogBuildRoot, 'thumbnails');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  const placementIds = await validatePayload(manifest, payload, runtimeRoot, thumbnailRoot);
  const runtimeFiles = (await readdir(runtimeRoot)).filter((filename) => filename.endsWith('.glb'));
  const thumbnailFiles = (await readdir(thumbnailRoot)).filter((filename) => filename.endsWith('.webp'));
  if (runtimeFiles.length !== 836 || thumbnailFiles.length !== 836 || placementIds.length !== 500) throw new Error(`Unexpected local payload scale: ${runtimeFiles.length} GLBs, ${thumbnailFiles.length} thumbnails, ${placementIds.length} placeable`);

  await cleanupIthappyLocalCatalog();
  await mkdir(stagingRoot, { recursive: true });
  await cp(manifestPath, path.join(stagingRoot, 'runtime-catalog.json'));
  await cp(payloadPath, path.join(stagingRoot, 'catalog-payload.json'));
  await cp(runtimeRoot, path.join(stagingRoot, 'runtime-assets'), { recursive: true });
  await cp(thumbnailRoot, path.join(stagingRoot, 'thumbnails'), { recursive: true });
  await writeFile(path.join(stagingRoot, 'prototype-placement.json'), JSON.stringify(await inspectBounds(runtimeRoot, placementIds)));
  console.log(`Staged local catalog: ${payload.length} records, ${thumbnailFiles.length} thumbnails, ${runtimeFiles.length} lazy runtime GLBs, ${placementIds.length} prototype-placeable entries.`);
  return { catalogEntries: payload.length, categories: Object.keys(expectedCategories).length, thumbnails: thumbnailFiles.length, runtimeAssets: runtimeFiles.length };
};
