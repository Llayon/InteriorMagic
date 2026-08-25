// scripts/catalog/build-selection.mjs
// I2.2: emit the canonical runtime-owned selection at
// src/editor/catalog/data/production-catalog-v1.json.
// Deterministic: only inputs are upstream files + visual-curation-first-pass.csv.
// No wall-clock timestamps. No selectedAtCommit.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIthappyPipelineRoot, resolveIthappyCatalogBuildRoot, repositoryRoot } from './resolve-ithappy-root.mjs';

const VISUAL = path.join(repositoryRoot, 'docs/catalog/visual-curation-first-pass.csv');
const OUT = path.join(repositoryRoot, 'src/editor/catalog/data/production-catalog-v1.json');
const TRACK_BASE_FILE = path.join(repositoryRoot, '.agent-data/production-catalog-v1/track-base.sha');

const ROLE_VOCAB = ['sofa', 'armchair', 'coffeeTable', 'sideTable', 'console', 'tv', 'floorLamp', 'plant', 'rug', 'floorDecor'];

function sha256(file) {
  const buf = readFileSync(file);
  return createHash('sha256').update(buf).digest('hex');
}

function parseCsv(text) {
  const [header, ...lines] = text.replace(/\r/g, '').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
        if (ch === '"') { inQ = false; continue; }
        cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        values.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    values.push(cur);
    const row = {};
    cols.forEach((c, i) => (row[c] = values[i]));
    return row;
  });
}

export function buildSelection({ visualPath = VISUAL, outPath = OUT } = {}) {
  const rows = parseCsv(readFileSync(visualPath, 'utf8'));
  const kept = rows
    .filter((r) => r.firstPassVerdict === 'KEEP')
    .filter((r) => ['high', 'medium'].includes(r.confidence))
    .filter((r) => ROLE_VOCAB.includes(r.possibleSemanticRole));

  const assets = kept
    .map((r) => ({ assetId: r.assetId, semanticRole: r.possibleSemanticRole }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));

  // Dedup by assetId (keep first role — they are identical in our evidence file).
  const seen = new Set();
  const deduped = [];
  for (const a of assets) {
    if (seen.has(a.assetId)) continue;
    seen.add(a.assetId);
    deduped.push(a);
  }

  const byRole = deduped.reduce((acc, a) => ((acc[a.semanticRole] = (acc[a.semanticRole] ?? 0) + 1), acc), {});

  const policyPath = path.join(resolveIthappyPipelineRoot(), 'config', 'asset-policy.json');
  const manifestPath = path.join(resolveIthappyPipelineRoot(), 'manifests', 'runtime-catalog.json');
  const payloadPath = path.join(resolveIthappyCatalogBuildRoot(), 'manifests', 'catalog-payload.json');

  const policyJson = JSON.parse(readFileSync(policyPath, 'utf8'));
  const trackBaseSha = readFileSync(TRACK_BASE_FILE, 'utf8').trim();

  return {
    schemaVersion: 1,
    trackBaseSha,
    sourcePolicySha256: sha256(policyPath),
    sourcePipelineManifestSha256: sha256(manifestPath),
    sourcePayloadManifestSha256: sha256(payloadPath),
    pipelineVersion: policyJson.pipelineVersion ?? '1.0.0',
    policyVersion: policyJson.version ?? 1,
    assetCount: deduped.length,
    byRole,
    assets: deduped,
  };
}

export function main() {
  const sel = buildSelection();
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(sel, null, 2) + '\n');
  console.log(`wrote ${OUT} (${sel.assetCount} assets) byRole=${JSON.stringify(sel.byRole)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}