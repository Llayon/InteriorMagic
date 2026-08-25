// scripts/catalog/render-inventory-md.mjs
// Renders docs/catalog/production-catalog-v1-inventory.md from the I0.1 JSON.
// Pure data + markdown — no GLB/thumbnail reads.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIthappyPipelineRoot, repositoryRoot } from './resolve-ithappy-root.mjs';

const INVENTORY = path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.json');

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function dist(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    n: sorted.length,
  };
}

function table(rows) {
  if (!rows.length) return '_none_';
  const headers = Object.keys(rows[0]);
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`);
  return lines.join('\n');
}

export function renderInventoryMarkdown() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  const rows = inventory.rows;

  const byDisplay = new Map();
  for (const r of rows) byDisplay.set(r.displayCategory, (byDisplay.get(r.displayCategory) ?? 0) + 1);
  const displayRows = [...byDisplay.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ displayCategory: category, count }));
  displayRows.push({ displayCategory: 'Total', count: rows.length });

  const bySource = new Map();
  for (const r of rows) bySource.set(r.sourceCategory, (bySource.get(r.sourceCategory) ?? 0) + 1);
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ sourceCategory: category, count }));
  sourceRows.push({ sourceCategory: 'Total', count: rows.length });

  const metrics = {
    runtimeBytes: dist(rows.map((r) => r.runtimeBytes)),
    triangleCount: dist(rows.map((r) => r.triangleCount)),
    materialCount: dist(rows.map((r) => r.materialCount)),
    textureCount: dist(rows.map((r) => r.textureCount)),
    analyticalDecodedRGBABytes: dist(rows.map((r) => r.analyticalDecodedRGBABytes)),
  };

  const tv = rows.filter((r) => r.sourceCategory === 'tv' || r.prototypeDerivedRole === 'tv').length;
  const policy = JSON.parse(readFileSync(path.join(resolveIthappyPipelineRoot(), 'config', 'asset-policy.json'), 'utf8'));

  return [
    '# Production Catalog v1 — Inventory',
    '',
    `**Source pipeline:** ITHappy (${rows.length} candidates).  `,
    `**Upstream policy:** asset-policy.json version \`${policy.version}\`, pipelineVersion \`${policy.pipelineVersion}\`.  `,
    `**Producer hard cap:** maxTextureDimension: ${policy.default?.maxTextureDimension ?? 'n/a'} (per asset-policy.json default).  `,
    '',
    '## Candidate total',
    '',
    `**${rows.length}** ITHappy entries (join of runtime-catalog ∩ catalog-payload ∩ production_inventory ∩ runtime_policy_validation ∩ geometry_invariance ∩ gltf_validation ∩ thumbnail_inventory).`,
    '',
    '## By displayCategory',
    '',
    table(displayRows),
    '',
    '## By sourceCategory',
    '',
    table(sourceRows),
    '',
    '## Runtime metric distributions',
    '',
    table([
      { metric: 'runtimeBytes', ...metrics.runtimeBytes, unit: 'bytes' },
      { metric: 'triangleCount', ...metrics.triangleCount, unit: 'tris' },
      { metric: 'materialCount', ...metrics.materialCount, unit: 'materials' },
      { metric: 'textureCount', ...metrics.textureCount, unit: 'textures' },
      { metric: 'analyticalDecodedRGBABytes', ...metrics.analyticalDecodedRGBABytes, unit: 'bytes' },
    ]),
    '',
    '## TV coverage',
    '',
    tv > 0
      ? `Found ${tv} candidate(s) explicitly classified as TV in sourceCategory. See I1.5 visual audit for authoritative verdict.`
      : 'Zero entries with `sourceCategory === "tv"` in upstream ITHappy manifest on origin/main. Visual pass over `electronics`/`entertainment` sourceCategories is mandatory before claiming TV absence — see `docs/catalog/visual-curation.csv`.',
    '',
    '## Reference-only assets (not in Production Pack)',
    '',
    'Existing in-repo hand-curated entries in `src/editor/assets/registry.ts` (17):',
    '',
    '- 6 prototype SVG-stub entries (`sofa`, `chair`, `table`, `plant`, `rug`, `lamp` — last one has no `modelUrl`) — provenance unknown, excluded per project reset.',
    '- 10 Kenney trial entries (`nordicSofa`, `nordicArmchair`, `relaxArmchair`, `glassCoffeeTable`, `drawerSideTable`, `roundedRug`, `roundFloorLamp`, `tallPottedPlant`, `leafyPlant`, `lowBookcase`) — CC0 documented in `THIRD_PARTY_ASSETS.md`, tagged `trial`, NOT in Production Pack.',
    '- 1 sheen entry (`sheenChair`) — CC0 KhronosGroup, exceeds runtime policy (4.13 MiB / 39,936 tri), kept as textured-PBR fixture only.',
    '',
    '## Upstream artifact paths (read-only)',
    '',
    '- `ithappy-production-pipeline/manifests/runtime-catalog.json`',
    '- `ithappy-production-pipeline/config/asset-policy.json`',
    '- `ithappy-production-pipeline/reports/runtime_policy_validation.csv`',
    '- `ithappy-production-pipeline/reports/production_inventory.csv`',
    '- `ithappy-production-pipeline/reports/geometry_invariance.csv`',
    '- `ithappy-production-pipeline/reports/gltf_validation.csv`',
    '- `ithappy-catalog-build/manifests/catalog-payload.json`',
    '- `ithappy-catalog-build/reports/thumbnail_inventory.csv`',
    '',
    'Resolved via scripts/catalog/resolve-ithappy-root.mjs (mirrors scripts/ithappy-local-staging.mjs exactly).',
    '',
  ].join('\n');
}

export function main() {
  const md = renderInventoryMarkdown();
  mkdirSync(path.join(repositoryRoot, 'docs/catalog'), { recursive: true });
  writeFileSync(path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.md'), md);
  console.log('wrote production-catalog-v1-inventory.md');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}