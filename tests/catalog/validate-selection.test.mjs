// tests/catalog/validate-selection.test.mjs
//
// CI-hermetic catalog acceptance gate tests. NO upstream I/O, NO filesystem
// reads outside the repo, NO buildInventory. These tests run inside GitHub
// Actions on a clean checkout with no .agent-data present.
//
// Coverage:
//   1) validateInventoryEvidence(row, assetId) — pure per-row branch tests.
//      Each test mutates ONLY the field under characterization, so deleting
//      any one branch in production causes the corresponding test to fail.
//      This is the contract-level guarantee that the catalog evidence gate
//      is not silently regressed.
//   2) validateSelectionEvidence({selection, inventory, actualSourceHashes})
//      — pure selection-level tests with synthetic fixtures covering
//      every surface branch (manifest shape, hash mismatch, assetCount
//      mismatch, byRole mismatch, membership, duplicates, semanticRole).
//
// Upstream-dependent integration tests (real hash recomputation, real
// buildInventory) live in tests/catalog/upstream/validate-selection.test.mjs
// and run only via `npm run test:catalog:upstream` on machines that have
// the developer's external .agent-data directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInventoryEvidence,
  validateSelectionEvidence,
} from '../../scripts/catalog/validate-selection.mjs';

// ---------------------------------------------------------------------------
// Fixture: base valid inventory row used by per-row tests.
// ---------------------------------------------------------------------------
function baseValidRow() {
  return {
    assetId: 'carpet',
    policyVersion: 1,
    maxTextureDimension: 512,
    runtimePolicyStatus: 'PASS',
    geometryInvarianceStatus: 'PASS',
    gltfValidationStatus: 'PASS',
    conversionStatus: 'built',
    thumbnailBytes: 1234,
    thumbnailStatus: 'ok',
  };
}

// ---------------------------------------------------------------------------
// Section 1 — validateInventoryEvidence (pure per-row).
// ---------------------------------------------------------------------------

test('validateInventoryEvidence: fully valid row → []', () => {
  const v = validateInventoryEvidence(baseValidRow(), 'carpet');
  assert.deepEqual(v, []);
});

test('validateInventoryEvidence: runtimePolicyStatus=FAIL → runtimePolicyStatus_not_PASS', () => {
  const row = baseValidRow();
  row.runtimePolicyStatus = 'FAIL';
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('runtimePolicyStatus_not_PASS'),
    `expected runtimePolicyStatus_not_PASS, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'runtimePolicyStatus_not_PASS');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 'FAIL');
  for (const code of codes) {
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'policyVersion_not_1');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: geometryInvarianceStatus=FAIL → geometryInvarianceStatus_not_PASS', () => {
  const row = baseValidRow();
  row.geometryInvarianceStatus = 'FAIL';
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('geometryInvarianceStatus_not_PASS'),
    `expected geometryInvarianceStatus_not_PASS, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'geometryInvarianceStatus_not_PASS');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 'FAIL');
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'policyVersion_not_1');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: gltfValidationStatus=FAIL → gltfValidationStatus_not_PASS', () => {
  const row = baseValidRow();
  row.gltfValidationStatus = 'FAIL';
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('gltfValidationStatus_not_PASS'),
    `expected gltfValidationStatus_not_PASS, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'gltfValidationStatus_not_PASS');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 'FAIL');
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'policyVersion_not_1');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: conversionStatus!=built → conversionStatus_not_built', () => {
  const row = baseValidRow();
  row.conversionStatus = 'pending';
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('conversionStatus_not_built'),
    `expected conversionStatus_not_built, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'conversionStatus_not_built');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 'pending');
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'policyVersion_not_1');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: thumbnailBytes=0 → thumbnailBytes_invalid', () => {
  const row = baseValidRow();
  row.thumbnailBytes = 0;
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('thumbnailBytes_invalid'),
    `expected thumbnailBytes_invalid, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'thumbnailBytes_invalid');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 0);
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'policyVersion_not_1');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: thumbnailStatus="" → thumbnailStatus_empty', () => {
  const row = baseValidRow();
  row.thumbnailStatus = '';
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('thumbnailStatus_empty'),
    `expected thumbnailStatus_empty, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'thumbnailStatus_empty');
  assert.equal(hit.assetId, 'carpet');
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'policyVersion_not_1');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: policyVersion=2 → policyVersion_not_1', () => {
  const row = baseValidRow();
  row.policyVersion = 2;
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('policyVersion_not_1'),
    `expected policyVersion_not_1, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'policyVersion_not_1');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 2);
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'maxTextureDimension_over_512');
  }
});

test('validateInventoryEvidence: maxTextureDimension=1024 → maxTextureDimension_over_512', () => {
  const row = baseValidRow();
  row.maxTextureDimension = 1024;
  const v = validateInventoryEvidence(row, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('maxTextureDimension_over_512'),
    `expected maxTextureDimension_over_512, got ${JSON.stringify(codes)}`);
  const hit = v.find((x) => x.code === 'maxTextureDimension_over_512');
  assert.equal(hit.assetId, 'carpet');
  assert.equal(hit.got, 1024);
  for (const code of codes) {
    assert.notEqual(code, 'runtimePolicyStatus_not_PASS');
    assert.notEqual(code, 'geometryInvarianceStatus_not_PASS');
    assert.notEqual(code, 'gltfValidationStatus_not_PASS');
    assert.notEqual(code, 'conversionStatus_not_built');
    assert.notEqual(code, 'thumbnailBytes_invalid');
    assert.notEqual(code, 'thumbnailStatus_empty');
    assert.notEqual(code, 'policyVersion_not_1');
  }
});

test('validateInventoryEvidence: null row → evidence_row_missing', () => {
  const v = validateInventoryEvidence(null, 'carpet');
  const codes = v.map((x) => x.code);
  assert.ok(codes.includes('evidence_row_missing'),
    `expected evidence_row_missing, got ${JSON.stringify(codes)}`);
});

// ---------------------------------------------------------------------------
// Section 2 — validateSelectionEvidence (pure selection-level).
//
// All tests here use synthetic fixtures:
//   - synthetic selection object (built in JS, not read from disk)
//   - synthetic inventory array
//   - synthetic actualSourceHashes
// This guarantees CI-hermetic execution: no .agent-data, no buildInventory.
// ---------------------------------------------------------------------------

// Build a synthetic selection that mirrors the real schema with every field
// passing. Tests clone + mutate one field to characterize each branch.
function baseValidSelection(extra = {}) {
  return {
    schemaVersion: 1,
    trackBaseSha: '1c32b27bfddb1b98ac7b70c9fa642604cb4d6790',
    sourcePolicySha256: 'a'.repeat(64),
    sourcePipelineManifestSha256: 'b'.repeat(64),
    sourcePayloadManifestSha256: 'c'.repeat(64),
    pipelineVersion: '1.0.0',
    policyVersion: 1,
    assetCount: 1,
    byRole: { sofa: 1 },
    assets: [{ assetId: 'sofa_001', semanticRole: 'sofa' }],
    ...extra,
  };
}

// Synthetic inventory row matching the base valid row above.
function baseValidInventory() {
  return [{
    assetId: 'sofa_001',
    policyVersion: 1,
    maxTextureDimension: 512,
    runtimePolicyStatus: 'PASS',
    geometryInvarianceStatus: 'PASS',
    gltfValidationStatus: 'PASS',
    conversionStatus: 'built',
    thumbnailBytes: 1234,
    thumbnailStatus: 'ok',
  }];
}

const HASHES = {
  sourcePolicySha256: 'a'.repeat(64),
  sourcePipelineManifestSha256: 'b'.repeat(64),
  sourcePayloadManifestSha256: 'c'.repeat(64),
};

test('validateSelectionEvidence: fully valid synthetic selection → passed=true, violations=[]', () => {
  const r = validateSelectionEvidence({
    selection: baseValidSelection(),
    inventory: baseValidInventory(),
    actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, true);
  assert.equal(r.selectionSize, 1);
  assert.equal(r.violations.length, 0);
  assert.equal(r.hashCheck.sourcePolicySha256.match, true);
  assert.equal(r.hashCheck.sourcePipelineManifestSha256.match, true);
  assert.equal(r.hashCheck.sourcePayloadManifestSha256.match, true);
});

test('validateSelectionEvidence: sourcePolicySha256 mismatch → sourcePolicySha256_mismatch', () => {
  const sel = baseValidSelection({ sourcePolicySha256: '0'.repeat(64) });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'sourcePolicySha256_mismatch'));
});

test('validateSelectionEvidence: sourcePipelineManifestSha256 mismatch → sourcePipelineManifestSha256_mismatch', () => {
  const sel = baseValidSelection({ sourcePipelineManifestSha256: '0'.repeat(64) });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'sourcePipelineManifestSha256_mismatch'));
});

test('validateSelectionEvidence: sourcePayloadManifestSha256 mismatch → sourcePayloadManifestSha256_mismatch', () => {
  const sel = baseValidSelection({ sourcePayloadManifestSha256: '0'.repeat(64) });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'sourcePayloadManifestSha256_mismatch'));
});

test('validateSelectionEvidence: assetCount mismatch → assetCount_mismatch', () => {
  const sel = baseValidSelection({ assetCount: 999 });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'assetCount_mismatch'));
});

test('validateSelectionEvidence: byRole mismatch → byRole_mismatch', () => {
  const sel = baseValidSelection({ byRole: { sofa: 999 } });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'byRole_mismatch'));
});

test('validateSelectionEvidence: selected id absent from inventory → selected_absent_from_runtime_manifest', () => {
  const sel = baseValidSelection({ assets: [{ assetId: 'definitely_not_in_inventory', semanticRole: 'sofa' }] });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'selected_absent_from_runtime_manifest'));
});

test('validateSelectionEvidence: duplicate asset id → duplicate_id', () => {
  const sel = baseValidSelection({
    assets: [
      { assetId: 'sofa_001', semanticRole: 'sofa' },
      { assetId: 'sofa_001', semanticRole: 'sofa' },
    ],
    assetCount: 2,
    byRole: { sofa: 2 },
  });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'duplicate_id'),
    `expected duplicate_id, got ${JSON.stringify(r.violations.map((v) => v.code))}`);
});

test('validateSelectionEvidence: invalid semanticRole → invalid_semanticRole', () => {
  const sel = baseValidSelection({
    assets: [{ assetId: 'sofa_001', semanticRole: 'garbageRole' }],
    assetCount: 1,
    byRole: { garbageRole: 1 },
  });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'invalid_semanticRole'),
    `expected invalid_semanticRole, got ${JSON.stringify(r.violations.map((v) => v.code))}`);
});

test('validateSelectionEvidence: bad schemaVersion → bad_schema_version', () => {
  const sel = baseValidSelection({ schemaVersion: 2 });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'bad_schema_version'));
});

test('validateSelectionEvidence: missing trackBaseSha → missing_or_invalid_track_base_sha', () => {
  const sel = baseValidSelection({ trackBaseSha: '' });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'missing_or_invalid_track_base_sha'));
});

test('validateSelectionEvidence: selectedAtCommit present → selectedAtCommit_present', () => {
  const sel = baseValidSelection({ selectedAtCommit: 'deadbeef' });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'selectedAtCommit_present'));
});

test('validateSelectionEvidence: assets not array → assets_not_array', () => {
  const sel = baseValidSelection({ assets: 'not-an-array' });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'assets_not_array'));
});

test('validateSelectionEvidence: missing assetId → missing_assetId', () => {
  const sel = baseValidSelection({ assets: [{ semanticRole: 'sofa' }] });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'missing_assetId'));
});

test('validateSelectionEvidence: tvCount < 2 → tv_coverage_below_min warning (not failure)', () => {
  // 1 tv (below min) — selection passes evidence, just emits a warning.
  const sel = baseValidSelection({
    assets: [{ assetId: 'tv_001', semanticRole: 'tv' }],
    assetCount: 1,
    byRole: { tv: 1 },
  });
  const inventory = [{ ...baseValidInventory()[0], assetId: 'tv_001' }];
  const r = validateSelectionEvidence({
    selection: sel, inventory, actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, true);
  assert.equal(r.tvCount, 1);
  assert.ok(r.warnings.some((w) => w.code === 'tv_coverage_below_min'));
});

test('validateSelectionEvidence: selectionSize < 40 → pack_size_below_40 warning (not failure)', () => {
  // 5-item selection passes evidence, just emits a pack-size warning.
  const assets = [];
  const byRole = {};
  for (let i = 0; i < 5; i++) {
    const id = `sofa_${i.toString().padStart(3, '0')}`;
    assets.push({ assetId: id, semanticRole: 'sofa' });
    byRole.sofa = (byRole.sofa ?? 0) + 1;
  }
  const sel = baseValidSelection({ assetCount: 5, byRole, assets });
  const inventory = assets.map((a) => ({ ...baseValidInventory()[0], assetId: a.assetId }));
  const r = validateSelectionEvidence({
    selection: sel, inventory, actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, true);
  assert.equal(r.selectionSize, 5);
  assert.ok(r.warnings.some((w) => w.code === 'pack_size_below_40'));
});

test('validateSelectionEvidence: missing_or_invalid source hash → missing_or_invalid_*', () => {
  const sel = baseValidSelection({ sourcePolicySha256: 'not-a-real-sha256' });
  const r = validateSelectionEvidence({
    selection: sel, inventory: baseValidInventory(), actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'missing_or_invalid_sourcePolicySha256'));
});

test('validateSelectionEvidence: per-row evidence FAIL still emits the correct per-row code', () => {
  // Verify that the pure layer surfaces per-row codes (via the helper) for
  // an asset whose inventory row says geometryInvarianceStatus=FAIL.
  const inventory = [{
    assetId: 'sofa_001',
    policyVersion: 1,
    maxTextureDimension: 512,
    runtimePolicyStatus: 'PASS',
    geometryInvarianceStatus: 'FAIL',
    gltfValidationStatus: 'PASS',
    conversionStatus: 'built',
    thumbnailBytes: 1234,
    thumbnailStatus: 'ok',
  }];
  const r = validateSelectionEvidence({
    selection: baseValidSelection(), inventory, actualSourceHashes: HASHES,
  });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.code === 'geometryInvarianceStatus_not_PASS'),
    `expected geometryInvarianceStatus_not_PASS, got ${JSON.stringify(r.violations.map((v) => v.code))}`);
});