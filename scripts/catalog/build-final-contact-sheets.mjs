// scripts/catalog/build-final-contact-sheets.mjs
// I2.5: deterministic labeled contact sheets containing ONLY the final
// 65 selected assets. 8-12 per sheet. assetId+sourceCategory per cell.
// Original thumbnail (not a crop).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveIthappyPipelineRoot,
  repositoryRoot,
} from './resolve-ithappy-root.mjs';

const SEL = path.join(repositoryRoot, 'src/editor/catalog/data/production-catalog-v1.json');
const SHEETS_DIR = path.join(repositoryRoot, '.agent-data/production-catalog-v1/final-contact-sheets');
const PER_SHEET = 10;

export function planFinalSheets(assets, runtime, perSheet = PER_SHEET) {
  const byId = new Map(runtime.map((e) => [e.id, e]));
  const rows = assets.map((a) => {
    const r = byId.get(a.assetId);
    return { assetId: a.assetId, semanticRole: a.semanticRole, sourceCategory: r?.category ?? 'unknown', runtimeFilename: r?.runtimeFilename };
  });
  const groups = new Map();
  for (const r of rows) {
    const k = r.semanticRole;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const sheets = [];
  let idx = 0;
  for (const [role, items] of groups) {
    items.sort((a, b) => a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));
    for (let i = 0; i < items.length; i += perSheet) {
      idx += 1;
      const chunk = items.slice(i, i + perSheet);
      sheets.push({ sheetId: `final-${String(idx).padStart(2, '0')}-${role}`, role, items: chunk });
    }
  }
  return sheets;
}

function escape(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function indexCsv(sheets) {
  const cols = ['sheetId', 'cell', 'assetId', 'semanticRole', 'sourceCategory', 'thumbnailFilename'];
  const rows = [];
  for (const s of sheets) {
    for (let c = 0; c < s.items.length; c += 1) {
      rows.push({
        sheetId: s.sheetId,
        cell: c + 1,
        assetId: s.items[c].assetId,
        semanticRole: s.items[c].semanticRole,
        sourceCategory: s.items[c].sourceCategory,
        thumbnailFilename: `thumbnails/${s.items[c].assetId}.webp`,
      });
    }
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n') + '\n';
}

function htmlForSheet(sheet) {
  const cells = sheet.items.map((item) => `
    <div class="cell">
      <img src="thumbnails/${escape(item.assetId)}.webp" alt="${escape(item.assetId)}" loading="lazy" />
      <div class="label"><b>${escape(item.assetId)}</b><br/><span>${escape(item.sourceCategory)} → ${escape(item.semanticRole)}</span></div>
    </div>`).join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escape(sheet.sheetId)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;background:#fafafa}
h1{font-size:18px;margin:0 0 12px 0}
h2{font-size:14px;margin:12px 0 8px 0;color:#555}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.cell{background:#fff;border:1px solid #ddd;padding:6px;text-align:center}
.cell img{width:100%;height:auto;background:#eee9e1;display:block;image-rendering:auto}
.label{font-size:11px;margin-top:4px;line-height:1.3}
.label b{font-family:ui-monospace,monospace}
.label span{color:#666}
</style></head><body>
<h1>${escape(sheet.sheetId)} — ${sheet.items.length} assets (semanticRole: ${escape(sheet.role)})</h1>
<div class="grid">${cells}</div>
</body></html>`;
}

export function main() {
  const sel = JSON.parse(readFileSync(SEL, 'utf8'));
  const runtime = JSON.parse(readFileSync(path.join(resolveIthappyPipelineRoot(), 'manifests', 'runtime-catalog.json'), 'utf8'));
  const sheets = planFinalSheets(sel.assets, runtime);
  mkdirSync(SHEETS_DIR, { recursive: true });
  writeFileSync(path.join(SHEETS_DIR, 'final-sheet-index.csv'), indexCsv(sheets));
  for (const s of sheets) writeFileSync(path.join(SHEETS_DIR, `${s.sheetId}.html`), htmlForSheet(s));
  console.log(`wrote ${sheets.length} final contact sheets + index`);
  const byRole = {};
  for (const s of sheets) byRole[s.role] = (byRole[s.role] ?? 0) + s.items.length;
  console.log('per-role:', JSON.stringify(byRole));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}