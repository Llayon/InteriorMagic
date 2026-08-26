// tests/catalog/upstream/scan-provenance.test.mjs
//
// Upstream-only. scanProvenance() walks the developer's full repo
// filesystem to look for ITHappy + license/provenance keyword co-occurrences.
// This depends on whatever files exist on the developer's machine.
//
// Moved out of tests/catalog/ (CI-hermetic) into tests/catalog/upstream/
// during the Catalog Gate Hardening PR because the scan depends on the
// developer's filesystem state — GitHub Actions on a clean checkout
// would scan a different tree.
//
// The historical "NOT_FOUND" assertion from Track I has been replaced with
// a structural assertion: the report must contain a verdict (either FOUND
// or NOT_FOUND — whichever the current filesystem produces), plus the
// searched-locations block. The scan's job is to report honestly, not to
// lock down a historical answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanProvenance } from '../../../scripts/catalog/scan-provenance.mjs';

test('scan returns a markdown report with explicit verdict', () => {
  const md = scanProvenance();
  assert.match(md, /^# Production Catalog v1 — Provenance Scan/m);
  assert.match(md, /## Verdict/);
  assert.match(
    md,
    /ITHappy per-asset license ledger: (NOT_FOUND|FOUND)\./,
    'verdict must report either FOUND or NOT_FOUND depending on current filesystem',
  );
});

test('report references upstream ITHappy data root', () => {
  const md = scanProvenance();
  assert.ok(md.includes('ithappy-production-pipeline') || md.includes('.agent-data'));
});

test('report enumerates searched locations', () => {
  const md = scanProvenance();
  for (const loc of ['THIRD_PARTY_ASSETS.md', 'R2_ASSET_DELIVERY.md', 'docs/', 'ASSET_AUDIT.md']) {
    assert.ok(md.includes(loc), `missing searched location: ${loc}`);
  }
});

test('report includes reference-only license summary', () => {
  const md = scanProvenance();
  assert.match(md, /CC0/);
});