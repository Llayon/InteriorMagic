// scripts/catalog/audit-duplicates.mjs
// A8: only visual review may label a record as a true visual_duplicate.
// Metrics can only emit `metric_near_duplicate_candidate` or `intentional_variant`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './resolve-ithappy-root.mjs';

const INVENTORY = path.join(repositoryRoot, 'docs/catalog/production-catalog-v1-inventory.json');

function near(value, other, pct = 0.01) {
  return Math.abs(value - other) <= Math.abs(value) * pct;
}

export function buildDuplicateRows(inventoryRows) {
  // Build a map by (sourceCategory, rounded-metric-bucket) for fast pair detection.
  const buckets = new Map();
  for (const r of inventoryRows) {
    const key = r.sourceCategory;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const out = [];
  for (const r of inventoryRows) {
    let status = 'intentional_variant';
    let matchedWith = '';
    const peers = buckets.get(r.sourceCategory) ?? [];
    for (const p of peers) {
      if (p.assetId === r.assetId) continue;
      const sameBytes = near(r.runtimeBytes, p.runtimeBytes);
      const sameTri = near(r.triangleCount, p.triangleCount);
      const sameMats = r.materialCount === p.materialCount;
      const sameTex = r.textureCount === p.textureCount;
      if (sameBytes && sameTri && sameMats && sameTex) {
        status = 'metric_near_duplicate_candidate';
        matchedWith = p.assetId;
        break;
      }
    }
    out.push({
      assetId: r.assetId,
      sourceCategory: r.sourceCategory,
      runtimeFilename: r.runtimeFilename,
      runtimeBytes: r.runtimeBytes,
      triangleCount: r.triangleCount,
      materialCount: r.materialCount,
      textureCount: r.textureCount,
      duplicateStatus: status,
      matchedWith,
    });
  }
  // Stable sort by assetId.
  out.sort((a, b) => a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));
  return out;
}

export function auditDuplicates() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  return buildDuplicateRows(inventory.rows);
}

function toCsv(rows) {
  const cols = ['assetId', 'sourceCategory', 'runtimeFilename', 'runtimeBytes', 'triangleCount', 'materialCount', 'textureCount', 'duplicateStatus', 'matchedWith'];
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n') + '\n';
}

export function main() {
  const rows = auditDuplicates();
  mkdirSync(path.join(repositoryRoot, 'docs/catalog'), { recursive: true });
  writeFileSync(path.join(repositoryRoot, 'docs/catalog/duplicate-audit.csv'), toCsv(rows));
  const counts = rows.reduce((acc, r) => ((acc[r.duplicateStatus] = (acc[r.duplicateStatus] ?? 0) + 1), acc), {});
  console.log(`wrote duplicate-audit.csv (${rows.length} rows)`, JSON.stringify(counts));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}