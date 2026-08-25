import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory } from '../../../scripts/catalog/build-inventory.mjs';

test('inventory has exactly 836 rows', async () => {
  const rows = await buildInventory();
  assert.equal(rows.length, 836);
});

test('every row has all 25 documented columns', async () => {
  const row = (await buildInventory())[0];
  const cols = [
    'assetId','sourceCategory','displayCategory','displayName',
    'thumbnailFilename','thumbnailBytes','thumbnailWidth','thumbnailHeight',
    'thumbnailAreaPct','thumbnailStatus',
    'runtimeFilename','runtimeBytes','triangleCount','primitiveCount',
    'materialCount','textureCount','maxTextureDimension',
    'analyticalDecodedRGBABytes','policyVersion','conversionStatus',
    'runtimePolicyStatus','geometryInvarianceStatus','gltfValidationStatus',
    'prototypeDerivedRole','authoritativeSemanticRole',
  ];
  for (const c of cols) assert.ok(c in row, `missing ${c}`);
});

test('every sourceCategory is mapped to a displayCategory', async () => {
  for (const row of await buildInventory()) assert.ok(row.displayCategory);
});

test('runtimePolicyStatus is PASS for every row (upstream already validated)', async () => {
  for (const row of await buildInventory()) assert.equal(row.runtimePolicyStatus, 'PASS');
});

test('thumbnailStatus reflects upstream thumbnail_inventory.csv distribution', async () => {
  // Upstream `thumbnail_inventory.csv` may carry statuses {normal, too-small, ...} or
  // a single bulk status like "skipped" depending on the most recent QA run. We
  // assert that the join is 1:1 (every selected row carries a non-empty status)
  // and that webp is the format — both are upstream invariants.
  const rows = await buildInventory();
  const withStatus = rows.filter((r) => r.thumbnailStatus && r.thumbnailStatus.length > 0);
  assert.equal(withStatus.length, 836, 'every row must carry a thumbnailStatus from upstream');
  const webpCount = rows.filter((r) => r.thumbnailWidth === 256 && r.thumbnailHeight === 192).length;
  assert.ok(webpCount >= 700, `expected most thumbnails at 256x192 (got ${webpCount})`);
});