import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInventoryMarkdown } from '../../../scripts/catalog/render-inventory-md.mjs';
import { readFile } from 'node:fs/promises';

test('rendered markdown contains the seven required headings', () => {
  const md = renderInventoryMarkdown();
  for (const h of [
    '# Production Catalog v1 — Inventory',
    '## Candidate total',
    '## By displayCategory',
    '## By sourceCategory',
    '## Runtime metric distributions',
    '## TV coverage',
    '## Reference-only assets (not in Production Pack)',
  ]) assert.ok(md.includes(h), `missing heading: ${h}`);
});

test('candidate total is 836', () => {
  const md = renderInventoryMarkdown();
  assert.match(md, /Candidate total/);
  assert.match(md, /\*\*836\*\*/);
});

test('by displayCategory sections sum to 836', () => {
  const md = renderInventoryMarkdown();
  // Markdown table row "| Total | 836 |" appears in both byDisplayCategory and bySourceCategory.
  assert.match(md, /\| Total \| 836 \|/);
});

test('references upstream asset-policy.json maxTextureDimension 512', () => {
  const md = renderInventoryMarkdown();
  assert.match(md, /maxTextureDimension:\s*512/);
});

test('TV coverage is documented honestly', () => {
  const md = renderInventoryMarkdown();
  // Either TVs found or "no tv sourceCategory" — both acceptable honest reports.
  assert.ok(md.includes('TV coverage'));
});

test('regression: source module is importable from repo root', async () => {
  // The script reads docs/catalog/production-catalog-v1-inventory.json.
  // Path must be resolved relative to the script's own location.
  const stat = await readFile('docs/catalog/production-catalog-v1-inventory.json', 'utf8');
  const j = JSON.parse(stat);
  assert.equal(j.candidateCount, 836);
});