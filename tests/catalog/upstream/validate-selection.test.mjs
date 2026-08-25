// tests/catalog/upstream/validate-selection.test.mjs
//
// Upstream-only integration tests. These call validateSelection() directly,
// which reads the developer's external .agent-data directory via
// resolveIthappyPipelineRoot() and recomputes the SHA256 of the three
// upstream manifests.
//
// These tests MUST NOT run in GitHub Actions CI — they require external
// machine state. They run only on developer machines that have the
// upstream ITHappy data root available. Triggered via:
//
//   npm run test:catalog:upstream
//
// Or, if the developer wants the full end-to-end check including the
// command-line validator output:
//
//   node scripts/catalog/validate-selection.mjs
//
// Real-data contract (must hold for current main):
//   passed=true, selectionSize=47, tvCount=7,
//   hashCheck match=true for all three hashes,
//   violations=[], warnings=[].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSelection } from '../../../scripts/catalog/validate-selection.mjs';

test('upstream: real current 47 selection → passed=true, selectionSize=47, tvCount=7', async () => {
  const r = await validateSelection();
  assert.equal(r.passed, true);
  assert.equal(r.selectionSize, 47);
  assert.equal(r.tvCount, 7);
  assert.equal(r.violations.length, 0);
  assert.equal(r.warnings.length, 0);
});

test('upstream: all three hash checks report match=true on real selection', async () => {
  const r = await validateSelection();
  assert.equal(r.hashCheck.sourcePolicySha256.match, true);
  assert.equal(r.hashCheck.sourcePipelineManifestSha256.match, true);
  assert.equal(r.hashCheck.sourcePayloadManifestSha256.match, true);
});