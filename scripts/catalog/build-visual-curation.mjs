// scripts/catalog/build-visual-curation.mjs
// Stage 2+3 of the vision pipeline.
// Writes docs/catalog/visual-curation-first-pass.csv from a hand-curated
// evidence CSV (docs/catalog/visual-curation-first-pass.evidence.csv) so the
// agent can record verdicts without bloating tool calls.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './resolve-ithappy-root.mjs';

const EVIDENCE = path.join(repositoryRoot, 'docs/catalog/visual-curation-first-pass.evidence.csv');
const OUT = path.join(repositoryRoot, 'docs/catalog/visual-curation-first-pass.csv');

const SCHEMA = [
  'assetId',
  'firstPassVerdict',     // KEEP | REJECT | AMBIGUOUS
  'visualCategory',       // observed category (e.g. "sofa", "tv", "speaker")
  'categoryCorrect',      // yes | no (matches sourceCategory / family?)
  'visualQuality',        // good | acceptable | poor
  'silhouetteReadable',   // yes | no
  'possibleSemanticRole', // curated hint (NOT behaviorFor)
  'possibleDuplicateOf',  // assetId or empty
  'confidence',           // high | medium | low
  'shortEvidence',        // one short sentence
];

function toCsv(rows) {
  const e = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [SCHEMA.join(','), ...rows.map((r) => SCHEMA.map((c) => e(r[c])).join(','))].join('\n') + '\n';
}

export function buildVisualCuration(evidenceRows) {
  return evidenceRows.map((row) => {
    const r = {};
    for (const k of SCHEMA) r[k] = row[k] ?? '';
    return r;
  });
}

export function main() {
  if (!existsSync(EVIDENCE)) {
    console.error('evidence file missing:', EVIDENCE);
    process.exit(2);
  }
  const text = readFileSync(EVIDENCE, 'utf8').replace(/\r/g, '');
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  const rows = lines.map((line) => {
    const values = line.split(',');
    const row = {};
    cols.forEach((c, i) => (row[c] = values[i]));
    return row;
  });
  mkdirSync(path.join(repositoryRoot, 'docs/catalog'), { recursive: true });
  writeFileSync(OUT, toCsv(buildVisualCuration(rows)));
  const counts = rows.reduce((acc, r) => ((acc[r.firstPassVerdict] = (acc[r.firstPassVerdict] ?? 0) + 1), acc), {});
  console.log(`wrote ${OUT} (${rows.length} rows)`, JSON.stringify(counts));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}