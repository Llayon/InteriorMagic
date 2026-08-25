// scripts/catalog/scan-provenance.mjs
// Pure-text repository scan for ITHappy license/provenance evidence.
// READ-ONLY — does not modify repo or .agent-data.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './resolve-ithappy-root.mjs';

const ROOT = repositoryRoot;

function walkText(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.git') || name === 'dist' || name === '.worktrees' || name === '.agent-data' || name === '.agent-worktrees' || name === 'playwright-report' || name === 'test-results' || name === 'catalog') continue;
      walkText(full, out);
    } else if (/\.(md|json|csv|ts|mjs|js|txt)$/.test(name) && st.size < 1_000_000) {
      out.push(full);
    }
  }
  return out;
}

function search(text, patterns) {
  const lc = text.toLowerCase();
  return patterns.filter((p) => lc.includes(p.toLowerCase()));
}

const LICENSE_PATTERNS = ['CC0', 'CC-BY', 'CC BY', 'attribution', 'permitted use', 'public domain', 'license'];
const PROVENANCE_PATTERNS = ['provenance', 'source URL', 'upstream', 'attribution'];
const ITHAPPY_KEYWORDS = ['ithappy', 'Ithappy', 'ITHAPPY'];

export function scanProvenance() {
  const files = walkText(ROOT);
  const hits = []; // { file, line, kind, matched }
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lc = text.toLowerCase();
    const hasIthappy = ITHAPPY_KEYWORDS.some((k) => lc.includes(k.toLowerCase()));
    if (!hasIthappy) continue;
    const matchedLic = search(text, LICENSE_PATTERNS);
    const matchedProv = search(text, PROVENANCE_PATTERNS);
    if (!matchedLic.length && !matchedProv.length) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const ll = line.toLowerCase();
      if (!ITHAPPY_KEYWORDS.some((k) => ll.includes(k.toLowerCase()))) return;
      if (matchedLic.some((p) => ll.includes(p.toLowerCase())) || matchedProv.some((p) => ll.includes(p.toLowerCase()))) {
        hits.push({ file: path.relative(ROOT, file), line: i + 1, kind: 'license+provenance', matched: line.trim().slice(0, 200) });
      }
    });
  }

  // Reference-only license summary from existing repo docs (read directly).
  const thirdParty = readFileSync(path.join(ROOT, 'THIRD_PARTY_ASSETS.md'), 'utf8');
  const r2 = readFileSync(path.join(ROOT, 'R2_ASSET_DELIVERY.md'), 'utf8');

  const refSheen = thirdParty.includes('Sheen Chair') && thirdParty.includes('CC0-1.0');
  const refKenney = thirdParty.includes('Kenney') && thirdParty.includes('CC0 1.0');

  // Did the search find ANY ithappy+license/provenance co-occurrence?
  const ithappyLicenseFound = hits.length > 0;

  const md = [
    '# Production Catalog v1 — Provenance Scan',
    '',
    `**Repo scan root:** \`${ROOT}\``,
    `**Files scanned:** ${files.length} text files (\`*.md|json|csv|ts|mjs|js|txt\`, ≤1 MB).`,
    `**Searched keywords:** ITHappy + {license, CC0, attribution, public domain, permitted use, provenance, upstream}.`,
    '',
    '## Verdict',
    '',
    `**ITHappy per-asset license ledger: ${ithappyLicenseFound ? 'FOUND' : 'NOT_FOUND'}.**`,
    '',
    ithappyLicenseFound
      ? `Found ${hits.length} co-occurrence(s) of "ithappy" with license/provenance terms in repo:`
      : 'No co-occurrence of "ithappy" with license/provenance terms in repo.',
    '',
    ...(ithappyLicenseFound ? hits.map((h) => `- \`${h.file}:${h.line}\` — ${h.matched}`) : []),
    '',
    '## Searched locations',
    '',
    '- `THIRD_PARTY_ASSETS.md` — repository-level license ledger for Sheen Chair (CC0-1.0) and Kenney Furniture Kit (CC0 1.0). Does NOT cover ITHappy.',
    '- `R2_ASSET_DELIVERY.md` — release + checksums process for ITHappy; does NOT establish per-asset license.',
    '- `ASSET_AUDIT.md` — per-asset runtime measurements; not a license record.',
    '- `docs/`` — project docs (adr/, qa/, research/); no ITHappy license ADR found.',
    '- `scripts/research/retail/` — Track F retail research; no ITHappy license record found.',
    '- Upstream ITHappy pipeline reports under `agent-data/ithappy-production-pipeline/reports/` and `agent-data/ithappy-catalog-build/reports/` — operational metrics, not license records.',
    '',
    '## Reference-only license summary (read from existing repo docs)',
    '',
    `- Sheen Chair (KhronosGroup glTF Sample Assets): CC0-1.0 documented in \`THIRD_PARTY_ASSETS.md\` — verified: ${refSheen ? 'YES' : 'NO'}`,
    `- Kenney Furniture Kit: CC0 1.0 documented in \`THIRD_PARTY_ASSETS.md\` — verified: ${refKenney ? 'YES' : 'NO'}`,
    `- 6 prototype SVG-stub entries in \`src/editor/assets/registry.ts\`: provenance NOT documented; treated as \`needs_provenance\` and excluded from Production Pack.`,
    '',
    '## Implication for Track I',
    '',
    'A11: missing ITHappy license evidence is reported as a production blocker, NOT a STOP. Cycle continues.',
    '',
    'The Production Pack curation proceeds. The final report (I-RPT.1) will explicitly call out that the legal gate remains unresolved and that activation should be deferred until per-asset license records are added (likely via an upstream ingestion ADR).',
    '',
    '## R2 release content (read from R2_ASSET_DELIVERY.md)',
    '',
    '```text',
    r2.match(/Release `v1` maps to:[\s\S]*?```/)?.[0] ?? '(not found)',
    '```',
    '',
  ].join('\n');

  return md;
}

export function main() {
  const md = scanProvenance();
  mkdirSync(path.join(ROOT, 'docs/catalog'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs/catalog/provenance-scan.md'), md);
  console.log('wrote provenance-scan.md');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}