// scripts/catalog/shortlist-technical.mjs
// Living-room-relevant technical shortlist. No quality ranking — pure category
// filter + deterministic byte-ascending stable sort. Visual curation happens
// in I1.5.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './resolve-ithappy-root.mjs';

const INVENTORY = path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.json');

export const LIVING_ROOM_SOURCECATEGORIES = [
  // Seating
  'sofa', 'chair',
  // Tables
  'coffee', 'work',
  // Storage (console candidates; entertainment may also be TV)
  'cupboard', 'dresser', 'shelf', 'entertainment',
  // Lighting
  'lamp',
  // Plants
  'flower',
  // Decor (carpet + picture/curtain/prop/electronics/ladder/training)
  'carpet', 'picture', 'curtain', 'prop', 'electronics', 'ladder', 'training',
];

export function buildTechnicalShortlist() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  const set = new Set(LIVING_ROOM_SOURCECATEGORIES);
  const rows = inventory.rows.filter((r) => set.has(r.sourceCategory) && r.runtimePolicyStatus === 'PASS');
  // Stable sort: bytes ascending then natural assetId. No quality ranking.
  rows.sort((a, b) => (a.runtimeBytes - b.runtimeBytes) || a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));
  return rows;
}

function toCsv(rows) {
  const cols = ['assetId', 'sourceCategory', 'displayCategory', 'displayName', 'thumbnailFilename', 'runtimeFilename', 'runtimeBytes', 'triangleCount', 'materialCount', 'textureCount', 'maxTextureDimension', 'runtimePolicyStatus'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export function main() {
  const rows = buildTechnicalShortlist();
  mkdirSync(path.join(repositoryRoot, 'docs/catalog'), { recursive: true });
  writeFileSync(path.join(repositoryRoot, 'docs/catalog/shortlist-technical.csv'), toCsv(rows));
  const bySource = rows.reduce((acc, r) => ((acc[r.sourceCategory] = (acc[r.sourceCategory] ?? 0) + 1), acc), {});
  console.log(`wrote shortlist-technical.csv (${rows.length} rows)`, JSON.stringify(bySource));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}