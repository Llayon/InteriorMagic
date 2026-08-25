// scripts/catalog/validate-selection.mjs
// Fail-closed structural validator for the canonical selection manifest.
// A11/A12: missing TV or missing provenance does NOT flip passed=false —
// only emits a warning. Hard-fails on duplicate/unknown/missing role.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveIthappyPipelineRoot,
  repositoryRoot,
} from './resolve-ithappy-root.mjs';

const MANIFEST = path.join(repositoryRoot, 'src/editor/catalog/data/production-catalog-v1.json');
const ROLES = ['sofa', 'armchair', 'coffeeTable', 'sideTable', 'console', 'tv', 'floorLamp', 'plant', 'rug', 'floorDecor'];

export function validateSelection({ manifestPath = MANIFEST } = {}) {
  const sel = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const violations = [];
  const warnings = [];

  if (sel.schemaVersion !== 1) violations.push({ code: 'bad_schema_version', got: sel.schemaVersion });
  if (!sel.trackBaseSha || !/^[0-9a-f]{40}$/.test(sel.trackBaseSha)) violations.push({ code: 'missing_or_invalid_track_base_sha' });
  if (!/^[0-9a-f]{64}$/.test(sel.sourcePolicySha256)) violations.push({ code: 'missing_or_invalid_sourcePolicySha256' });
  if (!/^[0-9a-f]{64}$/.test(sel.sourcePipelineManifestSha256)) violations.push({ code: 'missing_or_invalid_sourcePipelineManifestSha256' });
  if (!/^[0-9a-f]{64}$/.test(sel.sourcePayloadManifestSha256)) violations.push({ code: 'missing_or_invalid_sourcePayloadManifestSha256' });

  // No selectedAtCommit (A3).
  if (sel.selectedAtCommit !== undefined && sel.selectedAtCommit !== null) {
    violations.push({ code: 'selectedAtCommit_present', got: sel.selectedAtCommit });
  }

  // Assets array carries per-asset semanticRole (A6).
  if (!Array.isArray(sel.assets)) violations.push({ code: 'assets_not_array' });
  const ids = new Set();
  for (const a of sel.assets ?? []) {
    if (!a.assetId) violations.push({ code: 'missing_assetId', asset: a });
    else if (ids.has(a.assetId)) violations.push({ code: 'duplicate_id', assetId: a.assetId });
    else ids.add(a.assetId);
    if (!ROLES.includes(a.semanticRole)) violations.push({ code: 'invalid_semanticRole', asset: a });
  }

  // Verify every selected id is in the runtime manifest (already validated upstream
  // for runtime bytes/triangles; we only check membership + per-row PASS).
  const runtimeManifestPath = path.join(resolveIthappyPipelineRoot(), 'manifests', 'runtime-catalog.json');
  const runtime = JSON.parse(readFileSync(runtimeManifestPath, 'utf8'));
  const byId = new Map(runtime.map((e) => [e.id, e]));
  for (const a of sel.assets ?? []) {
    const r = byId.get(a.assetId);
    if (!r) {
      violations.push({ code: 'selected_absent_from_runtime_manifest', assetId: a.assetId });
      continue;
    }
    if (r.policyVersion !== 1) violations.push({ code: 'policyVersion_not_1', assetId: a.assetId, got: r.policyVersion });
    if (r.maxTextureDimension > 512) violations.push({ code: 'maxTextureDimension_over_512', assetId: a.assetId, got: r.maxTextureDimension });
  }

  // Warnings (NOT failures): TV coverage, role distribution.
  const tvCount = (sel.byRole?.tv ?? 0);
  if (tvCount < 2) warnings.push({ code: 'tv_coverage_below_min', count: tvCount });
  const size = sel.assetCount ?? (sel.assets?.length ?? 0);
  if (size < 40) warnings.push({ code: 'pack_size_below_40', count: size });

  return {
    passed: violations.length === 0,
    selectionSize: size,
    byRole: sel.byRole,
    tvCount,
    violations,
    warnings,
  };
}

export function main() {
  const result = validateSelection();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}