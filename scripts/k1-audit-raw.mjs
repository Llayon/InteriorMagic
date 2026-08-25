// scripts/k1-audit-raw.mjs
//
// K1 — RAW audit pipeline (Task 2.1 of plan
// `.hermes/plans/2026-08-25_214943-k1-production-asset-spatial-truth.md` Amended v3).
//
// Purpose:
//   For each of the 47 frozen production assetIds in
//   `src/editor/catalog/data/production-catalog-v1.json`, compute:
//     - SHA256 of the source GLB at
//         ${ITHAPPY_PIPELINE_ROOT:-<repo-parent>/.agent-data/ithappy-production-pipeline}/runtime-assets/<assetId>.glb
//     - Box3 dimensions (width/height/depth) and min/max via THREE.Box3().setFromObject(scene)
//
//   Write the result to `.agent-data/k1-production-assets/reports/k1-audit-raw.json`.
//
// What this script does NOT do (Plan guardrails):
//   - NO orientation inference (Plan amendment #3).
//   - NO forward inference (Plan amendment #2: forward is frozen as +Z, see ADR).
//   - NO multipliers on dimensions (Plan amendment #5: footprint policy is recorded
//     separately in the facts artifact in Commit 2).
//   - NO `sourceCategory` used as authority — only as audit-row labeling.
//   - NO visual QA verdicts here; this is the spatial-only RAW audit.
//
// Pattern: `inspectBounds` from `scripts/ithappy-local-staging.mjs:27-50`.
// Same THREE.Box3 + GLTFLoader + updateMatrixWorld flow.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.self = globalThis;

// ----------------------------------------------------------------------------
// Paths
// ----------------------------------------------------------------------------

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
// scripts/ → worktree root
const repositoryRoot = path.resolve(scriptDir, '..');

// .agent-data lives OUTSIDE the worktree, two directories up from
// .agent-worktrees/k1-production-asset-spatial-truth/:
//   D:/Programms/Max/InteriorMagic/.agent-data/k1-production-assets/
// (consistent with the plan's `../../../.agent-data/...` reference).
const k1DataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data', 'k1-production-assets');
const k1LogsRoot = path.join(k1DataRoot, 'logs');
const k1ReportsRoot = path.join(k1DataRoot, 'reports');

// Pipeline root follows the existing convention in scripts/ithappy-local-staging.mjs,
// which resolves to `<main-checkout-parent>/.agent-data/ithappy-production-pipeline`
// when ITHAPPY_PIPELINE_ROOT is unset. In the worktree, the main checkout is
// three parents up from scripts/.
const dataRoot = path.resolve(repositoryRoot, '..', '..', '.agent-data');
const pipelineRoot = path.resolve(
  process.env.ITHAPPY_PIPELINE_ROOT || path.join(dataRoot, 'ithappy-production-pipeline'),
);
const runtimeAssetsRoot = path.join(pipelineRoot, 'runtime-assets');

const frozenSelectionPath = path.join(
  repositoryRoot,
  'src', 'editor', 'catalog', 'data', 'production-catalog-v1.json',
);
const k1BaseShaLogPath = path.join(k1LogsRoot, 'k1-base-sha.txt');
const outputReportPath = path.join(k1ReportsRoot, 'k1-audit-raw.json');

// ----------------------------------------------------------------------------
// Inspect bounds — Box3 only. Mirrors ithappy-local-staging.mjs inspectBounds.
// ----------------------------------------------------------------------------

const inspectRawBounds = async (assetIds) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const records = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  // Suppress harmless texture-load warnings (binaries live outside this loader's
  // context; the K1 pipeline never bundles external textures here).
  console.warn = (...args) => {
    if (!String(args[0]).startsWith("THREE.GLTFLoader: Couldn't load texture")) originalWarn(...args);
  };
  console.error = (...args) => {
    if (!String(args[0]).startsWith("THREE.GLTFLoader: Couldn't load texture")) originalError(...args);
  };
  try {
    for (const id of assetIds) {
      const filename = `${id}.glb`;
      const filepath = path.join(runtimeAssetsRoot, filename);
      const bytes = await readFile(filepath);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await loader.parseAsync(buffer, '');
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (![size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0)) {
        throw new Error(`Invalid RAW bounds for ${id}: ${size.x}, ${size.y}, ${size.z}`);
      }
      records.push({
        assetId: id,
        sourceFilename: filename,
        sourceSha256: sha256,
        sourceBytes: bytes.byteLength,
        rawDimensions: { width: size.x, height: size.y, depth: size.z },
        rawMin: { x: box.min.x, y: box.min.y, z: box.min.z },
        rawMax: { x: box.max.x, y: box.max.y, z: box.max.z },
      });
    }
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
  return records;
};

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

const main = async () => {
  // Load the frozen production selection (DO NOT MODIFY — Hard Exclusion spec §22).
  const selectionRaw = await readFile(frozenSelectionPath, 'utf8');
  const selection = JSON.parse(selectionRaw);

  if (selection.schemaVersion !== 1) {
    throw new Error(`Unexpected frozen selection schemaVersion: ${selection.schemaVersion}`);
  }
  if (selection.assetCount !== 47 || !Array.isArray(selection.assets) || selection.assets.length !== 47) {
    throw new Error(
      `Frozen selection assetCount mismatch: header=${selection.assetCount} array=${selection.assets?.length}`,
    );
  }

  // Build {assetId → semanticRole} lookup. semanticRole is used ONLY for audit-row
  // labeling — it is NEVER used as authority (Plan amendment #3).
  const roleById = new Map(selection.assets.map((a) => [a.assetId, a.semanticRole]));
  const assetIds = selection.assets.map((a) => a.assetId);

  // Read K1_BASE_SHA from the gitignored log file (Plan v3 #6 — never as a tracked file).
  const k1BaseSha = (await readFile(k1BaseShaLogPath, 'utf8')).trim();
  if (!/^[0-9a-f]{40}$/.test(k1BaseSha)) {
    throw new Error(`K1_BASE_SHA at ${k1BaseShaLogPath} is not a 40-char hex SHA: ${k1BaseSha}`);
  }

  // Inspect RAW Box3 + compute SHA256.
  const rawRecords = await inspectRawBounds(assetIds);

  // Annotate each record with semanticRole for audit-row labeling only.
  const assets = rawRecords
    .map((r) => ({ ...r, semanticRole: roleById.get(r.assetId) ?? null }))
    .sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));

  const report = {
    trackBaseSha: selection.trackBaseSha,
    k1BaseSha,
    assetCount: 47,
    pipelineRoot,
    runtimeAssetsRoot,
    schemaVersion: 1,
    notes: 'RAW audit — Box3 only. NO orientation inference. NO forward inference. NO multipliers. semanticRole is a label only (frozen selection owns authority).',
    assets,
  };

  await mkdir(k1ReportsRoot, { recursive: true });
  await writeFile(outputReportPath, JSON.stringify(report, null, 2));
  console.log(
    `K1 RAW audit: wrote ${assets.length} asset rows to ${outputReportPath}`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
