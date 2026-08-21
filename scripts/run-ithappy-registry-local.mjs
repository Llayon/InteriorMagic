import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

globalThis.self = globalThis;
const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const pipelineRoot = path.resolve(process.env.ITHAPPY_PIPELINE_ROOT || path.join(repositoryRoot, '..', '..', '.agent-data', 'ithappy-production-pipeline'));
const stagingRoot = path.resolve(repositoryRoot, 'public', '.local-assets', 'ithappy-registry');
const permittedRoot = path.resolve(repositoryRoot, 'public', '.local-assets');
const assetIds = ['sofa_026', 'sofa_037', 'sofa_041', 'chair_024', 'chair_036', 'chair_058', 'coffee_table', 'coffee_table_068', 'work_table_003', 'work_table_012', 'cupboard_003', 'dresser_085', 'shelf_071', 'entertainment_035', 'lamp_030', 'lamp_048', 'lamp_058', 'flower', 'flower_039', 'flower_043', 'carpet_017', 'carpet_022', 'ladder', 'ladder_008'];

if (!stagingRoot.startsWith(`${permittedRoot}${path.sep}`)) throw new Error(`Unsafe staging path: ${stagingRoot}`);

const inspectBounds = async (runtimeRoot) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const assets = {};
  for (const id of assetIds) {
    const bytes = await readFile(path.join(runtimeRoot, `${id}.glb`));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await loader.parseAsync(buffer, '');
    gltf.scene.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    assets[id] = { dimensions: { width: size.x, height: size.y, depth: size.z } };
  }
  return { provenance: 'prototype-raw-scene-bounds-not-production-metadata', assets };
};

const stage = async () => {
  const manifestPath = path.join(pipelineRoot, 'manifests', 'runtime-catalog.json');
  const runtimeRoot = path.join(pipelineRoot, 'runtime-assets');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length !== 836) throw new Error(`Expected 836 runtime catalog entries, received ${Array.isArray(manifest) ? manifest.length : 'invalid manifest'}`);
  const manifestIds = new Set(manifest.map((entry) => entry.id));
  const missing = assetIds.filter((id) => !manifestIds.has(id));
  if (missing.length) throw new Error(`Prototype IDs missing from manifest: ${missing.join(', ')}`);
  await mkdir(path.join(stagingRoot, 'runtime-assets'), { recursive: true });
  await mkdir(path.join(stagingRoot, 'thumbnails'), { recursive: true });
  await cp(manifestPath, path.join(stagingRoot, 'runtime-catalog.json'));
  for (const id of assetIds) await cp(path.join(runtimeRoot, `${id}.glb`), path.join(stagingRoot, 'runtime-assets', `${id}.glb`));
  await writeFile(path.join(stagingRoot, 'prototype-placement.json'), JSON.stringify(await inspectBounds(runtimeRoot), null, 2));
};

await stage();
try {
  const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [playwrightCli, 'test', '--config=playwright.ithappy-catalog.config.ts'], {
    cwd: repositoryRoot, env: process.env, stdio: 'inherit', shell: false, timeout: 360_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
