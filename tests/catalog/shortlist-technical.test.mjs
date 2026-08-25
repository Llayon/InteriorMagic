import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTechnicalShortlist, LIVING_ROOM_SOURCECATEGORIES } from '../../scripts/catalog/shortlist-technical.mjs';

test('LIVING_ROOM_SOURCECATEGORIES contains the documented set', () => {
  const expected = new Set([
    'sofa','chair','coffee','work','cupboard','dresser','shelf','entertainment',
    'lamp','flower','carpet','picture','curtain','prop','electronics','ladder','training',
  ]);
  for (const c of LIVING_ROOM_SOURCECATEGORIES) assert.ok(expected.has(c), `unexpected ${c}`);
  for (const c of expected) assert.ok(LIVING_ROOM_SOURCECATEGORIES.includes(c), `missing ${c}`);
});

test('shortlist excludes bedroom/kitchen-bath/architecture sourceCategories', () => {
  const rows = buildTechnicalShortlist();
  const banned = ['bed', 'kitchen', 'bathroom', 'wall', 'floor', 'door', 'window', 'wallpaper'];
  for (const row of rows) assert.ok(!banned.includes(row.sourceCategory));
});

test('shortlist keeps 300-600 rows (placement-enabled subset)', () => {
  const rows = buildTechnicalShortlist();
  assert.ok(rows.length >= 300 && rows.length <= 600, `got ${rows.length}`);
});

test('every shortlist row is PASS on upstream runtime policy', () => {
  for (const row of buildTechnicalShortlist()) assert.equal(row.runtimePolicyStatus, 'PASS');
});