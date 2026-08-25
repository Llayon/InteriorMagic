// scripts/catalog/build-contact-sheets.mjs
// Stage 1 of the two-stage vision pipeline.
// Groups the 500-candidate technical shortlist into deterministic
// contact sheets (≤25 per sheet), grouped by sourceCategory family,
// and emits a contact-sheet-index.csv mapping sheetId/cell/assetId.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './resolve-ithappy-root.mjs';

const SHORTLIST = path.join(repositoryRoot, 'docs/catalog/shortlist-technical.csv');
const SHEETS_DIR = path.join(repositoryRoot, '.agent-data/production-catalog-v1/contact-sheets');
const INDEX_PATH = path.join(SHEETS_DIR, 'contact-sheet-index.csv');
const PER_SHEET = 25;

// Display family used to group thumbnails into themed sheets.
const FAMILY = {
  sofa: 'sofa',
  chair: 'chair',
  coffee: 'tables', work: 'tables',
  cupboard: 'storage', dresser: 'storage', shelf: 'storage', entertainment: 'storage',
  lamp: 'lamp',
  flower: 'flower',
  carpet: 'rug',
  picture: 'decor', curtain: 'decor', prop: 'decor', electronics: 'electronics',
  ladder: 'decor', training: 'decor',
};

function familyOf(sourceCategory) {
  return FAMILY[sourceCategory] ?? 'other';
}

function readShortlist() {
  const text = readFileSync(SHORTLIST, 'utf8').replace(/\r/g, '');
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    const row = {};
    cols.forEach((c, i) => (row[c] = values[i]));
    return row;
  });
}

export function planSheets(rows, perSheet = PER_SHEET) {
  // Group by sourceCategory, preserve input order (which is bytes-ascending).
  const byCategory = new Map();
  for (const r of rows) {
    const cat = r.sourceCategory;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(r);
  }
  // Sort categories by total count desc for sheet ordering stability.
  const cats = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);
  const sheets = [];
  for (const [category, items] of cats) {
    for (let i = 0; i < items.length; i += perSheet) {
      const chunk = items.slice(i, i + perSheet);
      sheets.push({ category, family: familyOf(category), items: chunk });
    }
  }
  return sheets;
}

export function buildIndexRows(sheets) {
  const rows = [];
  for (let s = 0; s < sheets.length; s += 1) {
    const sheet = sheets[s];
    const sheetId = `cs-${String(s + 1).padStart(3, '0')}-${sheet.family}`;
    for (let c = 0; c < sheet.items.length; c += 1) {
      rows.push({
        sheetId,
        cell: c + 1,
        assetId: sheet.items[c].assetId,
        sourceCategory: sheet.items[c].sourceCategory,
        displayCategory: sheet.items[c].displayCategory,
        thumbnailPath: sheet.items[c].thumbnailFilename,
        runtimeFilename: sheet.items[c].runtimeFilename,
      });
    }
  }
  return rows;
}

function escape(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function indexToCsv(rows) {
  const cols = ['sheetId', 'cell', 'assetId', 'sourceCategory', 'displayCategory', 'thumbnailPath', 'runtimeFilename'];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n') + '\n';
}

function htmlForSheet(sheet, sheetId) {
  const cells = sheet.items.map((item, i) => `
    <div class="cell" data-asset-id="${escape(item.assetId)}" data-source-category="${escape(item.sourceCategory)}" data-family="${escape(sheet.family)}">
      <img src="${escape(item.thumbnailFilename)}" alt="${escape(item.assetId)}" loading="lazy" />
      <div class="label"><b>${escape(item.assetId)}</b> <span>${escape(item.sourceCategory)}</span></div>
    </div>
  `).join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escape(sheetId)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;background:#fafafa}
h1{font-size:18px;margin:0 0 12px 0}
h2{font-size:14px;margin:12px 0 8px 0;color:#555}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.cell{background:#fff;border:1px solid #ddd;padding:6px;text-align:center}
.cell img{width:100%;height:auto;background:#eee9e1;display:block}
.label{font-size:11px;margin-top:4px;display:flex;justify-content:space-between;gap:4px}
.label b{font-family:ui-monospace,monospace}
.label span{color:#666}
</style></head><body>
<h1>${escape(sheetId)} — ${sheet.items.length} assets (${escape(sheet.family)} / ${escape(sheet.category)})</h1>
<div class="grid">${cells}</div>
</body></html>`;
}

export function main() {
  const rows = readShortlist();
  const sheets = planSheets(rows);
  mkdirSync(SHEETS_DIR, { recursive: true });
  const indexRows = buildIndexRows(sheets);
  writeFileSync(INDEX_PATH, indexToCsv(indexRows));
  for (let s = 0; s < sheets.length; s += 1) {
    const sheet = sheets[s];
    const sheetId = `cs-${String(s + 1).padStart(3, '0')}-${sheet.family}`;
    writeFileSync(path.join(SHEETS_DIR, `${sheetId}.html`), htmlForSheet(sheet, sheetId));
  }
  const familyCounts = {};
  for (const s of sheets) familyCounts[s.family] = (familyCounts[s.family] ?? 0) + s.items.length;
  console.log(`wrote ${sheets.length} contact sheets + ${INDEX_PATH}; per-family totals:`, JSON.stringify(familyCounts));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}