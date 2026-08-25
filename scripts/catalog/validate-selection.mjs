// scripts/catalog/validate-selection.mjs
// P1.1 + P1.2: fail-closed validator.
// - Every selected id is checked against the joined inventory evidence
//   (runtime policy, geometry invariance, GLTF validation, conversion
//    status, thumbnail bytes/status, producer policy constraints).
// - All three upstream input hashes are recomputed and compared.
// - Manifest internal consistency is enforced (assetCount, byRole).
// A11/A12: missing TV / missing provenance are NOT failures.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveIthappyPipelineRoot,
  resolveIthappyCatalogBuildRoot,
  repositoryRoot,
} from './resolve-ithappy-root.mjs';
import { buildInventory } from './build-inventory.mjs';

const MANIFEST = path.join(repositoryRoot, 'src/editor/catalog/data/production-catalog-v1.json');
const POLICY_PATH = path.join(resolveIthappyPipelineRoot(), 'config', 'asset-policy.json');
const RUNTIME_PATH = path.join(resolveIthappyPipelineRoot(), 'manifests', 'runtime-catalog.json');
const PAYLOAD_PATH = path.join(resolveIthappyCatalogBuildRoot(), 'manifests', 'catalog-payload.json');

// Runtime allowed-role list. Mirrors FurnitureSemanticRole (cannot rely on TS
// at validator time). Must stay in lockstep with the canonical type.
const ROLES = [
  'sofa', 'armchair', 'coffeeTable', 'sideTable', 'console',
  'tv', 'floorLamp', 'plant', 'rug', 'floorDecor',
];

function sha256(file) {
  const buf = readFileSync(file);
  return createHash('sha256').update(buf).digest('hex');
}

export async function validateSelection({ manifestPath = MANIFEST } = {}) {
  const sel = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const violations = [];
  const warnings = [];

  // ---- Manifest shape ----------------------------------------------------
  if (sel.schemaVersion !== 1) violations.push({ code: 'bad_schema_version', got: sel.schemaVersion });
  if (!sel.trackBaseSha || !/^[0-9a-f]{40}$/.test(sel.trackBaseSha)) violations.push({ code: 'missing_or_invalid_track_base_sha' });
  for (const f of ['sourcePolicySha256', 'sourcePipelineManifestSha256', 'sourcePayloadManifestSha256']) {
    if (!/^[0-9a-f]{64}$/.test(sel[f])) violations.push({ code: `missing_or_invalid_${f}` });
  }
  if (sel.selectedAtCommit !== undefined && sel.selectedAtCommit !== null) {
    violations.push({ code: 'selectedAtCommit_present', got: sel.selectedAtCommit });
  }
  if (!Array.isArray(sel.assets)) violations.push({ code: 'assets_not_array' });

  // ---- Input-hash verification (P1.2) -------------------------------------
  const actualPolicySha = sha256(POLICY_PATH);
  const actualRuntimeSha = sha256(RUNTIME_PATH);
  const actualPayloadSha = sha256(PAYLOAD_PATH);
  if (sel.sourcePolicySha256 && sel.sourcePolicySha256 !== actualPolicySha) {
    violations.push({ code: 'sourcePolicySha256_mismatch', manifest: sel.sourcePolicySha256, actual: actualPolicySha });
  }
  if (sel.sourcePipelineManifestSha256 && sel.sourcePipelineManifestSha256 !== actualRuntimeSha) {
    violations.push({ code: 'sourcePipelineManifestSha256_mismatch', manifest: sel.sourcePipelineManifestSha256, actual: actualRuntimeSha });
  }
  if (sel.sourcePayloadManifestSha256 && sel.sourcePayloadManifestSha256 !== actualPayloadSha) {
    violations.push({ code: 'sourcePayloadManifestSha256_mismatch', manifest: sel.sourcePayloadManifestSha256, actual: actualPayloadSha });
  }

  // ---- Asset array integrity ---------------------------------------------
  const assets = sel.assets ?? [];
  const ids = new Set();
  for (const a of assets) {
    if (!a.assetId) violations.push({ code: 'missing_assetId', asset: a });
    else if (ids.has(a.assetId)) violations.push({ code: 'duplicate_id', assetId: a.assetId });
    else ids.add(a.assetId);
    if (!ROLES.includes(a.semanticRole)) violations.push({ code: 'invalid_semanticRole', asset: a });
  }

  // ---- assetCount === assets.length ---------------------------------------
  if (typeof sel.assetCount !== 'number') {
    violations.push({ code: 'assetCount_not_a_number', got: sel.assetCount });
  } else if (sel.assetCount !== assets.length) {
    violations.push({ code: 'assetCount_mismatch', declared: sel.assetCount, actual: assets.length });
  }

  // ---- byRole === recomputed ---------------------------------------------
  const recomputedByRole = {};
  for (const a of assets) {
    recomputedByRole[a.semanticRole] = (recomputedByRole[a.semanticRole] ?? 0) + 1;
  }
  const declaredByRole = sel.byRole ?? {};
  // Reject any unexpected or missing byRole entries.
  const allRoles = new Set([...Object.keys(recomputedByRole), ...Object.keys(declaredByRole)]);
  for (const role of allRoles) {
    if ((recomputedByRole[role] ?? 0) !== (declaredByRole[role] ?? 0)) {
      violations.push({ code: 'byRole_mismatch', role, declared: declaredByRole[role] ?? 0, recomputed: recomputedByRole[role] ?? 0 });
    }
  }

  // ---- Per-asset upstream evidence (P1.1) --------------------------------
  // Reuse buildInventory's joined evidence; do not re-join upstream.
  const inventory = await buildInventory();
  const byId = new Map(inventory.map((r) => [r.assetId, r]));
  for (const a of assets) {
    const r = byId.get(a.assetId);
    if (!r) { violations.push({ code: 'selected_absent_from_runtime_manifest', assetId: a.assetId }); continue; }
    if (r.policyVersion !== 1) violations.push({ code: 'policyVersion_not_1', assetId: a.assetId, got: r.policyVersion });
    if (r.maxTextureDimension > 512) violations.push({ code: 'maxTextureDimension_over_512', assetId: a.assetId, got: r.maxTextureDimension });
    if (r.runtimePolicyStatus !== 'PASS') violations.push({ code: 'runtimePolicyStatus_not_PASS', assetId: a.assetId, got: r.runtimePolicyStatus });
    if (r.geometryInvarianceStatus !== 'PASS') violations.push({ code: 'geometryInvarianceStatus_not_PASS', assetId: a.assetId, got: r.geometryInvarianceStatus });
    if (r.gltfValidationStatus !== 'PASS') violations.push({ code: 'gltfValidationStatus_not_PASS', assetId: a.assetId, got: r.gltfValidationStatus });
    if (r.conversionStatus !== 'built') violations.push({ code: 'conversionStatus_not_built', assetId: a.assetId, got: r.conversionStatus });
    if (!(Number(r.thumbnailBytes) > 0)) violations.push({ code: 'thumbnailBytes_invalid', assetId: a.assetId, got: r.thumbnailBytes });
    if (!r.thumbnailStatus || String(r.thumbnailStatus).length === 0) violations.push({ code: 'thumbnailStatus_empty', assetId: a.assetId });
  }

  // ---- Warnings (not failures, A11/A12) ----------------------------------
  const tvCount = recomputedByRole.tv ?? 0;
  if (tvCount < 2) warnings.push({ code: 'tv_coverage_below_min', count: tvCount });
  if (assets.length < 40) warnings.push({ code: 'pack_size_below_40', count: assets.length });

  return {
    passed: violations.length === 0,
    selectionSize: assets.length,
    byRole: recomputedByRole,
    tvCount,
    hashCheck: {
      sourcePolicySha256: { declared: sel.sourcePolicySha256, actual: actualPolicySha, match: sel.sourcePolicySha256 === actualPolicySha },
      sourcePipelineManifestSha256: { declared: sel.sourcePipelineManifestSha256, actual: actualRuntimeSha, match: sel.sourcePipelineManifestSha256 === actualRuntimeSha },
      sourcePayloadManifestSha256: { declared: sel.sourcePayloadManifestSha256, actual: actualPayloadSha, match: sel.sourcePayloadManifestSha256 === actualPayloadSha },
    },
    violations,
    warnings,
  };
}

export async function main() {
  const result = await validateSelection();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}