// scripts/catalog/build-inventory.mjs
// Joins 5 upstream reports on assetId:
//   runtime-catalog.json      (836 records)
//   catalog-payload.json      (836 records)
//   production_inventory.csv  (836 records; conversionStatus)
//   runtime_policy_validation.csv
//   geometry_invariance.csv
//   gltf_validation.csv
//   thumbnail_inventory.csv
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveIthappyPipelineRoot,
  resolveIthappyCatalogBuildRoot,
  repositoryRoot,
} from './resolve-ithappy-root.mjs';

const COLUMNS = [
  'assetId','sourceCategory','displayCategory','displayName',
  'thumbnailFilename','thumbnailBytes','thumbnailWidth','thumbnailHeight',
  'thumbnailAreaPct','thumbnailStatus',
  'runtimeFilename','runtimeBytes','triangleCount','primitiveCount',
  'materialCount','textureCount','maxTextureDimension',
  'analyticalDecodedRGBABytes','policyVersion','conversionStatus',
  'runtimePolicyStatus','geometryInvarianceStatus','gltfValidationStatus',
  'prototypeDerivedRole','authoritativeSemanticRole',
];

// Mirrors src/app/local/ithappyRegistryPrototype.ts behaviorFor().
function prototypeDerivedRoleFor(sourceCategory) {
  switch (sourceCategory) {
    case 'sofa': return 'sofa';
    case 'chair': return 'armchair';
    case 'coffee':
    case 'work': return 'coffeeTable';
    case 'cupboard':
    case 'dresser':
    case 'shelf':
    case 'entertainment': return 'console';
    case 'lamp': return 'floorLamp';
    case 'flower': return 'plant';
    case 'carpet': return 'rug';
    default: return 'floorDecor';
  }
}

async function readCsv(p) {
  const text = await readFile(p, 'utf8');
  // Strip CRLF so the last column doesn't carry '\r' (Windows line endings).
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const [header, ...rest] = lines;
  const cols = header.split(',');
  const out = new Map();
  for (const line of rest) {
    if (!line) continue;
    const row = {};
    const values = line.split(',');
    cols.forEach((c, i) => (row[c] = values[i]));
    out.set(row.id ?? row.assetId, row);
  }
  return out;
}

export async function buildInventory() {
  const pipelineRoot = resolveIthappyPipelineRoot();
  const buildRoot = resolveIthappyCatalogBuildRoot();

  const runtime = JSON.parse(await readFile(path.join(pipelineRoot, 'manifests', 'runtime-catalog.json'), 'utf8'));
  const payload = JSON.parse(await readFile(path.join(buildRoot, 'manifests', 'catalog-payload.json'), 'utf8'));
  const prodInv = await readCsv(path.join(pipelineRoot, 'reports', 'production_inventory.csv'));
  const policyVal = await readCsv(path.join(pipelineRoot, 'reports', 'runtime_policy_validation.csv'));
  const geomInv = await readCsv(path.join(pipelineRoot, 'reports', 'geometry_invariance.csv'));
  const gltfVal = await readCsv(path.join(pipelineRoot, 'reports', 'gltf_validation.csv'));
  const thumbInv = await readCsv(path.join(buildRoot, 'reports', 'thumbnail_inventory.csv'));

  const byId = new Map(runtime.map((entry) => [entry.id, entry]));
  const rows = payload.map((entry) => {
    const r = byId.get(entry.assetId);
    if (!r) throw new Error(`payload references missing runtime id: ${entry.assetId}`);
    if (r.runtimeFilename !== entry.runtimeFilename) throw new Error(`runtimeFilename mismatch: ${entry.assetId}`);
    if (r.runtimeBytes !== entry.runtimeBytes) throw new Error(`runtimeBytes mismatch: ${entry.assetId}`);
    const pi = prodInv.get(entry.assetId);
    const pv = policyVal.get(entry.assetId);
    const gi = geomInv.get(entry.assetId);
    const gv = gltfVal.get(entry.assetId);
    const ti = thumbInv.get(entry.assetId);
    return {
      assetId: entry.assetId,
      sourceCategory: entry.sourceCategory,
      displayCategory: entry.displayCategory,
      displayName: entry.displayName,
      thumbnailFilename: entry.thumbnailFilename,
      thumbnailBytes: ti ? Number(ti.thumbnailBytes) : '',
      thumbnailWidth: ti ? Number(ti.width) : '',
      thumbnailHeight: ti ? Number(ti.height) : '',
      thumbnailAreaPct: ti ? Number(ti.areaPct) : '',
      thumbnailStatus: ti ? ti.status : '',
      runtimeFilename: r.runtimeFilename,
      runtimeBytes: r.runtimeBytes,
      triangleCount: r.triangleCount,
      primitiveCount: r.primitiveCount,
      materialCount: r.materialCount,
      textureCount: r.textureCount,
      maxTextureDimension: r.maxTextureDimension,
      analyticalDecodedRGBABytes: r.analyticalDecodedRGBABytes,
      policyVersion: r.policyVersion,
      conversionStatus: pi ? pi.conversionStatus : '',
      runtimePolicyStatus: pv ? pv.status : '',
      geometryInvarianceStatus: gi ? gi.status : '',
      gltfValidationStatus: gv ? gv.status : '',
      prototypeDerivedRole: prototypeDerivedRoleFor(entry.sourceCategory),
      // authoritativeSemanticRole is filled per-asset by the vision-led review (I1.5).
      authoritativeSemanticRole: '',
    };
  });
  rows.sort((a, b) => a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));
  if (rows.length !== 836) throw new Error(`unexpected inventory size: ${rows.length} (expected 836)`);
  return rows;
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvEscape(r[c])).join(','))].join('\n') + '\n';
}

async function main() {
  const rows = await buildInventory();
  await mkdir(path.join(repositoryRoot, 'docs/catalog'), { recursive: true });
  await writeFile(path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.csv'), toCsv(rows));
  await writeFile(
    path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.json'),
    JSON.stringify({ version: 1, generatedFromUpstreamAt: new Date().toISOString(), candidateCount: rows.length, columns: COLUMNS, rows }, null, 2),
  );
  const withStatus = rows.filter((r) => r.thumbnailStatus && r.thumbnailStatus.length > 0).length;
  console.log(`wrote inventory (${rows.length} rows; ${withStatus} with thumbnailStatus)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}