import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSheets, buildIndexRows } from '../../scripts/catalog/build-contact-sheets.mjs';

const SHORTLIST_SAMPLE = [
  { assetId: 'a', sourceCategory: 'sofa', displayCategory: 'Seating', thumbnailFilename: 'thumbnails/a.webp', runtimeFilename: 'runtime-assets/a.glb' },
  { assetId: 'b', sourceCategory: 'sofa', displayCategory: 'Seating', thumbnailFilename: 'thumbnails/b.webp', runtimeFilename: 'runtime-assets/b.glb' },
  { assetId: 'c', sourceCategory: 'chair', displayCategory: 'Seating', thumbnailFilename: 'thumbnails/c.webp', runtimeFilename: 'runtime-assets/c.glb' },
  { assetId: 'd', sourceCategory: 'electronics', displayCategory: 'Decor', thumbnailFilename: 'thumbnails/d.webp', runtimeFilename: 'runtime-assets/d.glb' },
  { assetId: 'e', sourceCategory: 'entertainment', displayCategory: 'Storage', thumbnailFilename: 'thumbnails/e.webp', runtimeFilename: 'runtime-assets/e.glb' },
];

test('planSheets produces deterministic sheets per sourceCategory', () => {
  const sheets = planSheets(SHORTLIST_SAMPLE, 2);
  // 2 sofas -> 1 sheet; 1 chair -> 1 sheet; 1 electronics -> 1; 1 entertainment -> 1.
  assert.equal(sheets.length, 4);
  const sofaSheet = sheets.find((s) => s.category === 'sofa');
  assert.equal(sofaSheet.items.length, 2);
  const chairSheet = sheets.find((s) => s.category === 'chair');
  assert.equal(chairSheet.items.length, 1);
});

test('buildIndexRows emits one row per asset', () => {
  const sheets = planSheets(SHORTLIST_SAMPLE, 2);
  const rows = buildIndexRows(sheets);
  assert.equal(rows.length, 5);
  for (const r of rows) {
    assert.ok(r.sheetId);
    assert.ok(r.assetId);
    assert.ok(r.sourceCategory);
    assert.ok(r.thumbnailPath);
    assert.ok(r.runtimeFilename);
  }
});

test('sheetId uses family grouping (electronics vs storage)', () => {
  const sheets = planSheets(SHORTLIST_SAMPLE, 5);
  const eSheet = sheets.find((s) => s.category === 'electronics');
  const sSheet = sheets.find((s) => s.category === 'entertainment');
  assert.equal(eSheet.family, 'electronics');
  assert.equal(sSheet.family, 'storage');
});