import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanProvenance } from '../../scripts/catalog/scan-provenance.mjs';

test('scan returns a markdown report with explicit verdict', () => {
  const md = scanProvenance();
  assert.match(md, /^# Production Catalog v1 — Provenance Scan/m);
  assert.match(md, /## Verdict/);
});

test('report explicitly says ITHappy per-asset license ledger NOT FOUND in repo', () => {
  const md = scanProvenance();
  assert.match(md, /ITHappy per-asset license ledger: NOT_FOUND/);
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