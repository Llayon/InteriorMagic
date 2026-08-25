import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

test('I2.5: 47 verified retained, 18 excluded, union=65, intersection=0', () => {
  const sel = new Set(JSON.parse(readFileSync(path.join(root, 'src/editor/catalog/data/production-catalog-v1.json'), 'utf8')).assets.map((a) => a.assetId));
  const exclText = readFileSync(path.join(root, 'docs/catalog/i2.5-per-asset-exclusions.csv'), 'utf8').replace(/\r/g, '');
  const excl = new Set(exclText.trim().split('\n').slice(1).map((l) => l.split(',')[0]));
  const verified = new Set(
    readFileSync(path.join(root, 'docs/catalog/i2.5-per-asset-verification.csv'), 'utf8')
      .replace(/\r/g, '')
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split(',')[0]),
  );

  assert.equal(sel.size, 47, 'canonical selection must have 47 assets');
  assert.equal(excl.size, 18, 'exclusion file must have 18 rows');
  assert.equal(verified.size, 47, 'verification file must have 47 rows');

  // 1. verified retained IDs == canonical selection IDs
  assert.deepEqual([...verified].sort(), [...sel].sort(), 'verified ∩ retained must equal canonical selection');

  // 2. retained ∩ excluded == empty
  const inter = [...sel].filter((x) => excl.has(x));
  assert.equal(inter.length, 0, 'retained ∩ excluded must be empty');

  // 3. retained ∪ excluded == 65
  const union = new Set([...sel, ...excl]);
  assert.equal(union.size, 65, 'retained ∪ excluded must equal 65 unique I2.5 inputs');
});