// scripts/catalog/validate-selection.mjs
// P1.1 + P1.2: fail-closed validator.
// - Every selected id is checked against the joined inventory evidence
//   (runtime policy, geometry invariance, GLTF validation, conversion
//    status, thumbnail bytes/status, producer policy constraints).
// - All three upstream input hashes are recomputed and compared.
// - Manifest internal consistency is enforced (assetCount, byRole).
// A11/A12: missing TV / missing provenance are NOT failures.
//
// Post-merge hardening architecture (CI does NOT touch the developer's
// external .agent-data directory):
//
//   1) validateInventoryEvidence(row, assetId)      — PURE, per-row gate.
//   2) validateSelectionEvidence({selection,
//        inventory, actualSourceHashes})            — PURE, full selection
//        gate. NO filesystem, no buildInventory, no global state.
//   3) validateSelection({manifestPath})            — thin wrapper: reads
//        manifest bytes, recomputes upstream SHA256s, awaits buildInventory,
//        then delegates to validateSelectionEvidence().
//
//   CI-hermetic tests (npm run test:catalog) target layers 1 and 2.
//   Upstream-dependent tests (npm run test:catalog:upstream) target layer 3.
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

/**
 * Pure per-row evidence validation. Returns an array of violation records
 * for the given already-joined inventory row.
 *
 * Contract:
 *   - no filesystem access
 *   - no global mutable state
 *   - deterministic (output depends only on inputs)
 *   - receives the joined row (already produced by buildInventory)
 *   - returns explicit violation records
 *
 * `assetId` is attached to every violation so callers can route diagnostics
 * without re-reading `row.assetId`.
 */
export function validateInventoryEvidence(row, assetId) {
  const violations = [];
  if (!row) {
    // Caller checks membership first and emits 'selected_absent_from_runtime_manifest'.
    // A null row here is an internal misuse — fail closed with a stable code.
    violations.push({ code: 'evidence_row_missing', assetId });
    return violations;
  }
  if (row.policyVersion !== 1) violations.push({ code: 'policyVersion_not_1', assetId, got: row.policyVersion });
  if (row.maxTextureDimension > 512) violations.push({ code: 'maxTextureDimension_over_512', assetId, got: row.maxTextureDimension });
  if (row.runtimePolicyStatus !== 'PASS') violations.push({ code: 'runtimePolicyStatus_not_PASS', assetId, got: row.runtimePolicyStatus });
  if (row.geometryInvarianceStatus !== 'PASS') violations.push({ code: 'geometryInvarianceStatus_not_PASS', assetId, got: row.geometryInvarianceStatus });
  if (row.gltfValidationStatus !== 'PASS') violations.push({ code: 'gltfValidationStatus_not_PASS', assetId, got: row.gltfValidationStatus });
  if (row.conversionStatus !== 'built') violations.push({ code: 'conversionStatus_not_built', assetId, got: row.conversionStatus });
  if (!(Number(row.thumbnailBytes) > 0)) violations.push({ code: 'thumbnailBytes_invalid', assetId, got: row.thumbnailBytes });
  if (!row.thumbnailStatus || String(row.thumbnailStatus).length === 0) violations.push({ code: 'thumbnailStatus_empty', assetId });
  return violations;
}

/**
 * Pure selection-level evidence validation. No filesystem, no buildInventory,
 * no global state. Inputs:
 *
 *   selection         — the parsed catalog selection manifest.
 *   inventory         — array of joined inventory rows (e.g. from buildInventory()).
 *   actualSourceHashes — { sourcePolicySha256, sourcePipelineManifestSha256,
 *                          sourcePayloadManifestSha256 } recomputed by the caller.
 *
 * Performs:
 *   - manifest shape integrity (schemaVersion, trackBaseSha, source hashes,
 *     no selectedAtCommit, assets is array)
 *   - source hash comparisons (declared vs actual)
 *   - asset array integrity (missing assetId, duplicate_id, invalid_semanticRole)
 *   - assetCount === assets.length
 *   - byRole === recomputed from assets
 *   - per-row validateInventoryEvidence() and membership check
 *   - tvCount + warnings (A11/A12 — non-fatal)
 *
 * Returns: { passed, selectionSize, byRole, tvCount, hashCheck, violations, warnings }.
 */
export function validateSelectionEvidence({ selection, inventory, actualSourceHashes }) {
  const sel = selection;
  const violations = [];
  const warnings = [];
  const declaredPolicy = sel.sourcePolicySha256;
  const declaredRuntime = sel.sourcePipelineManifestSha256;
  const declaredPayload = sel.sourcePayloadManifestSha256;
  const actualPolicy = actualSourceHashes?.sourcePolicySha256 ?? null;
  const actualRuntime = actualSourceHashes?.sourcePipelineManifestSha256 ?? null;
  const actualPayload = actualSourceHashes?.sourcePayloadManifestSha256 ?? null;

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
  if (declaredPolicy && actualPolicy !== null && declaredPolicy !== actualPolicy) {
    violations.push({ code: 'sourcePolicySha256_mismatch', manifest: declaredPolicy, actual: actualPolicy });
  }
  if (declaredRuntime && actualRuntime !== null && declaredRuntime !== actualRuntime) {
    violations.push({ code: 'sourcePipelineManifestSha256_mismatch', manifest: declaredRuntime, actual: actualRuntime });
  }
  if (declaredPayload && actualPayload !== null && declaredPayload !== actualPayload) {
    violations.push({ code: 'sourcePayloadManifestSha256_mismatch', manifest: declaredPayload, actual: actualPayload });
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
  // Reuse buildInventory's joined evidence; do not re-join upstream here.
  const byId = new Map((inventory ?? []).map((r) => [r.assetId, r]));
  for (const a of assets) {
    const r = byId.get(a.assetId);
    if (!r) { violations.push({ code: 'selected_absent_from_runtime_manifest', assetId: a.assetId }); continue; }
    violations.push(...validateInventoryEvidence(r, a.assetId));
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
      sourcePolicySha256: { declared: declaredPolicy, actual: actualPolicy, match: declaredPolicy != null && actualPolicy != null && declaredPolicy === actualPolicy },
      sourcePipelineManifestSha256: { declared: declaredRuntime, actual: actualRuntime, match: declaredRuntime != null && actualRuntime != null && declaredRuntime === actualRuntime },
      sourcePayloadManifestSha256: { declared: declaredPayload, actual: actualPayload, match: declaredPayload != null && actualPayload != null && declaredPayload === actualPayload },
    },
    violations,
    warnings,
  };
}

/**
 * Thin wrapper that performs the real upstream I/O:
 *   - reads the selection manifest from disk
 *   - awaits buildInventory() (joins upstream reports)
 *   - recomputes SHA256 of policy, runtime manifest, and payload manifest
 *   - delegates the pure check to validateSelectionEvidence()
 *
 * Real-data output contract (must hold for current main):
 *   passed=true, selectionSize=47, tvCount=7, hashCheck match=true for
 *   all three hashes, violations=[], warnings=[].
 */
export async function validateSelection({ manifestPath = MANIFEST } = {}) {
  const sel = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const actualPolicySha = sha256(POLICY_PATH);
  const actualRuntimeSha = sha256(RUNTIME_PATH);
  const actualPayloadSha = sha256(PAYLOAD_PATH);
  const inventory = await buildInventory();
  return validateSelectionEvidence({
    selection: sel,
    inventory,
    actualSourceHashes: {
      sourcePolicySha256: actualPolicySha,
      sourcePipelineManifestSha256: actualRuntimeSha,
      sourcePayloadManifestSha256: actualPayloadSha,
    },
  });
}

export async function main() {
  const result = await validateSelection();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}