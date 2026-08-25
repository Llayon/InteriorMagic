// scripts/catalog/i2.5-apply-exclusions.mjs
// Apply per-asset visual-verdict exclusions. Regenerate canonical selection.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveIthappyPipelineRoot,
  resolveIthappyCatalogBuildRoot,
  repositoryRoot,
} from './resolve-ithappy-root.mjs';
import { createHash } from 'node:crypto';

const SEL = path.join(repositoryRoot, 'src/editor/catalog/data/production-catalog-v1.json');
const EXCL = path.join(repositoryRoot, 'docs/catalog/i2.5-per-asset-exclusions.csv');

function sha256(file) {
  const buf = readFileSync(file);
  return createHash('sha256').update(buf).digest('hex');
}

export function applyExclusions({ selPath = SEL, exclPath = EXCL, outPath = SEL } = {}) {
  const sel = JSON.parse(readFileSync(selPath, 'utf8'));
  const exclText = readFileSync(exclPath, 'utf8').replace(/\r/g, '');
  const [, ...lines] = exclText.trim().split('\n');
  const excluded = new Set();
  const exclusionRecords = [];
  for (const line of lines) {
    const [assetId, originalRole, excludeReason, confidence, evidence] = line.split(',');
    excluded.add(assetId);
    exclusionRecords.push({ assetId, originalRole, excludeReason, confidence, evidence });
  }

  const retained = sel.assets.filter((a) => !excluded.has(a.assetId));
  retained.sort((a, b) => a.assetId.localeCompare(b.assetId, 'en', { numeric: true }));

  const byRole = retained.reduce((acc, a) => ((acc[a.semanticRole] = (acc[a.semanticRole] ?? 0) + 1), acc), {});

  const policyPath = path.join(resolveIthappyPipelineRoot(), 'config', 'asset-policy.json');
  const manifestPath = path.join(resolveIthappyPipelineRoot(), 'manifests', 'runtime-catalog.json');
  const payloadPath = path.join(resolveIthappyCatalogBuildRoot(), 'manifests', 'catalog-payload.json');
  const policyJson = JSON.parse(readFileSync(policyPath, 'utf8'));
  const trackBaseSha = readFileSync(path.join(repositoryRoot, '.agent-data/production-catalog-v1/track-base.sha'), 'utf8').trim();

  const updated = {
    schemaVersion: 1,
    trackBaseSha,
    sourcePolicySha256: sha256(policyPath),
    sourcePipelineManifestSha256: sha256(manifestPath),
    sourcePayloadManifestSha256: sha256(payloadPath),
    pipelineVersion: policyJson.pipelineVersion ?? '1.0.0',
    policyVersion: policyJson.version ?? 1,
    assetCount: retained.length,
    byRole,
    assets: retained,
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(updated, null, 2) + '\n');

  const report = {
    schemaVersion: 1,
    inputSize: sel.assetCount,
    excludedCount: excluded.size,
    outputSize: retained.length,
    byRole,
    excluded: exclusionRecords,
  };
  writeFileSync(path.join(repositoryRoot, 'docs/catalog/i2.5-application-report.json'), JSON.stringify(report, null, 2));
  return updated;
}

export function main() {
  const { updated } = applyExclusions();
  console.log(`i2.5: applied exclusions; outputSize=${updated.assetCount} byRole=${JSON.stringify(updated.byRole)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}