// I2.4: render a deterministic, human-readable rationale from the canonical
// selection plus the joined inventory and visual evidence. The JSON manifest
// remains the only runtime source of truth.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './resolve-ithappy-root.mjs';

const manifestPath = path.join(repositoryRoot, 'src/editor/catalog/data/production-catalog-v1.json');
const inventoryPath = path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.csv');
const visualPath = path.join(repositoryRoot, 'docs/catalog/visual-curation-first-pass.csv');
const outputPath = path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-selection.md');

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const parseLine = (line) => {
    const values = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else value += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { values.push(value); value = ''; }
      else value += ch;
    }
    values.push(value);
    return values;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderSelectionRationale({ output = outputPath } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const inventory = new Map(parseCsv(readFileSync(inventoryPath, 'utf8')).map((row) => [row.assetId, row]));
  const visual = parseCsv(readFileSync(visualPath, 'utf8'));
  const selected = new Set(manifest.assets.map((asset) => asset.assetId));
  const rows = manifest.assets.map((asset) => {
    const row = inventory.get(asset.assetId);
    if (!row) throw new Error(`selected asset missing from inventory: ${asset.assetId}`);
    const evidence = visual.find((candidate) => candidate.assetId === asset.assetId)?.shortEvidence ?? 'direct-vision evidence in visual-curation-first-pass.csv';
    return `| ${asset.assetId} | ${row.sourceCategory} | ${asset.semanticRole} | ${row.runtimeBytes} | ${row.runtimePolicyStatus} | ${row.thumbnailStatus} | ${escapeCell(evidence)} |`;
  });
  const rejected = visual.filter((row) => !selected.has(row.assetId) && (row.firstPassVerdict === 'REJECT' || row.confidence === 'low'));
  const rejectedLines = rejected.length === 0
    ? '- None in the visual evidence file.'
    : rejected.map((row) => `- \`${row.assetId}\`: ${escapeCell(row.shortEvidence || row.firstPassVerdict)}`).join('\n');
  const text = [
    '# Production Catalog v1 — Selection Rationale',
    '',
    'This report is derived from the canonical runtime manifest and the joined upstream inventory. It is explanatory only; `src/editor/catalog/data/production-catalog-v1.json` remains the single source of truth.',
    '',
    `Selected assets: **${manifest.assetCount}**. Every selected row has a verified semantic role and upstream runtime/thumbnail QA status.`,
    '',
    '| Asset | Source category | Semantic role | Runtime bytes | Runtime policy | Thumbnail | Evidence |',
    '| --- | --- | --- | ---: | --- | --- | --- |',
    ...rows,
    '',
    '## Rejected or low-confidence evidence',
    '',
    'The following rows are not selected because the visual pass rejected them or marked them low-confidence. Source category alone is never sufficient for production semantics.',
    '',
    rejectedLines,
    '',
    'See `visual-curation-first-pass.csv`, `i2.5-per-asset-exclusions.csv`, and `production-catalog-v1-inventory.csv` for full evidence and upstream facts.',
    '',
  ].join('\n');
  writeFileSync(output, text);
  return { output, selected: manifest.assetCount, rejected: rejected.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(JSON.stringify(renderSelectionRationale(), null, 2));
}
