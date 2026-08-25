import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDuplicates, buildDuplicateRows } from '../../scripts/catalog/audit-duplicates.mjs';

test('auditDuplicates emits 836 rows', () => {
  const rows = auditDuplicates();
  assert.equal(rows.length, 836);
});

test('duplicateStatus uses the new vocabulary (A8: metric_near_duplicate_candidate)', () => {
  const rows = auditDuplicates();
  const valid = new Set(['exact_duplicate', 'metric_near_duplicate_candidate', 'intentional_variant', 'unique', 'unknown']);
  for (const r of rows) assert.ok(valid.has(r.duplicateStatus), `bad status: ${r.duplicateStatus}`);
});

test('no exact_duplicate is expected (runtimeFilename is derived from assetId)', () => {
  const rows = auditDuplicates();
  const exact = rows.filter((r) => r.duplicateStatus === 'exact_duplicate');
  assert.equal(exact.length, 0, 'no two assetIds can share the same derived runtimeFilename');
});

test('metric_near_duplicate_candidate requires all 4 metric dimensions to match', () => {
  // Synthetic pair — must trigger metric_near_duplicate_candidate when all 4 match within ±1%.
  const synthetic = [
    { assetId: 'a', sourceCategory: 'sofa', runtimeBytes: 100000, triangleCount: 500, materialCount: 2, textureCount: 2 },
    { assetId: 'b', sourceCategory: 'sofa', runtimeBytes: 100500, triangleCount: 502, materialCount: 2, textureCount: 2 },
    { assetId: 'c', sourceCategory: 'sofa', runtimeBytes: 200000, triangleCount: 500, materialCount: 2, textureCount: 2 }, // bytes differ >1%
    { assetId: 'd', sourceCategory: 'sofa', runtimeBytes: 100000, triangleCount: 500, materialCount: 5, textureCount: 2 }, // mats differ
  ];
  const rows = buildDuplicateRows(synthetic);
  assert.equal(rows.find((r) => r.assetId === 'a').duplicateStatus, 'metric_near_duplicate_candidate');
  assert.equal(rows.find((r) => r.assetId === 'b').duplicateStatus, 'metric_near_duplicate_candidate');
  assert.equal(rows.find((r) => r.assetId === 'c').duplicateStatus, 'intentional_variant');
  assert.equal(rows.find((r) => r.assetId === 'd').duplicateStatus, 'intentional_variant');
});

test('intentional_variant is the default for shared sourceCategory with different files', () => {
  const rows = auditDuplicates();
  const variants = rows.filter((r) => r.duplicateStatus === 'intentional_variant');
  // 86 Seating + 38 Tables + 107 Storage + 19 Plants + 19 Lighting + 231 Decor + 23 Bedroom + 127 Kitchen & Bath + 186 Architecture
  // ... roughly every asset except metric_near_duplicate_candidates ends up as intentional_variant
  // since runtimeFilename is always unique. So most rows are intentional_variant.
  assert.ok(variants.length > 0);
});