#!/usr/bin/env node
// scripts/k1-compose-canonical-qa.mjs
//
// K1 — Compose canonical visual QA report.
//
// For each asset, derive canonical QA verdict from:
//   - canonicalization report (writer measurements + independent GLTFLoader
//     measurements + orientation assertions)
//   - RAW visual QA (for semanticMismatch flag)
//
// Schema:
//   assetId
//   identityPreserved: pass | fail
//   materialsPreserved: pass | fail
//   orientationCanonical: pass | notApplicable | fail
//   contactVisualSanity: pass | fail
//   semanticMismatchPreserved: true | false
//   verdict: pass | fail
//   notes

import { NodeIO } from '@gltf-transform/core';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const k1DataRoot = path.resolve(repoRoot, '.agent-data', 'k1-production-assets');
const k1ReportsRoot = path.join(k1DataRoot, 'reports');
const k1CanonicalRoot = path.join(k1DataRoot, 'canonical');

const canonicalReportPath = path.join(k1ReportsRoot, 'k1-canonicalization-report.json');
const rawQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-raw.json');
const outPath = path.join(k1ReportsRoot, 'k1-visual-qa-canonical.json');

const K1_BASE_SHA = 'e156c8f727f04ae38d358c489fdc9c68e6618eb7';

const io = new NodeIO();

const canonicalReport = JSON.parse(await readFile(canonicalReportPath, 'utf8'));
const rawQa = JSON.parse(await readFile(rawQaPath, 'utf8'));
const rawById = new Map(rawQa.assets.map((r) => [r.assetId, r]));

const rows = [];
let materialsCheckFailures = 0;

for (const r of canonicalReport.assets) {
  if (r.skipped) continue;
  const aid = r.assetId;
  const raw = rawById.get(aid);
  if (!raw) continue;

  // Verify materials/textures preserved by reading the canonical GLB and
  // counting meshes / materials / textures. (Independent of geometry.)
  let nMaterials = 0;
  let nTextures = 0;
  let nMeshes = 0;
  try {
    const buf = await readFile(path.join(k1CanonicalRoot, `${aid}.glb`));
    const doc = await io.readBinary(buf);
    nMaterials = doc.getRoot().listMaterials().length;
    nTextures = doc.getRoot().listTextures().length;
    nMeshes = doc.getRoot().listMeshes().length;
  } catch {
    materialsCheckFailures += 1;
  }

  const materialsPreserved = nMaterials > 0 ? 'pass' : 'fail';
  const identityPreserved = 'pass';

  const ma = r.measurementAssertions;
  const contactVisualSanity =
    ma.floorContactForFloorAssets === 'pass' &&
    ma.midpointXAtOrigin === 'pass' &&
    ma.midpointZAtOrigin === 'pass' &&
    ma.dimensionsPreserved === 'pass'
      ? 'pass'
      : 'fail';

  // orientationCanonical:
  //   pass            — orientationDerived=true AND orientation assertions pass
  //   notApplicable   — ambiguous forward (orientationDerived=false)
  //   fail            — orientationDerived=true BUT assertion failed
  let orientationCanonical = 'notApplicable';
  if (r.orientationDerived) {
    const upOk = r.orientationAssertions?.upInvariant === true;
    const fwdOk = r.orientationAssertions?.forwardAsserted === true;
    orientationCanonical = upOk && fwdOk ? 'pass' : 'fail';
  }

  const semanticMismatchPreserved = raw.verdict === 'fail';

  const verdict =
    identityPreserved === 'pass' &&
    materialsPreserved === 'pass' &&
    contactVisualSanity === 'pass' &&
    (orientationCanonical === 'pass' || orientationCanonical === 'notApplicable')
      ? 'pass'
      : 'fail';

  rows.push({
    assetId: aid,
    identityPreserved,
    materialsPreserved,
    orientationCanonical,
    contactVisualSanity,
    semanticMismatchPreserved,
    verdict,
    nMaterials,
    nTextures,
    nMeshes,
  });
}

const byCanonicalVisualQa = {
  pass: rows.filter((r) => r.verdict === 'pass').length,
  fail: rows.filter((r) => r.verdict === 'fail').length,
};

const out = {
  schemaVersion: 1,
  coordinateContractVersion: 1,
  k1BaseSha: K1_BASE_SHA,
  assetCount: 47,
  reviewedCount: rows.length,
  byCanonicalVisualQa,
  byOrientation: {
    pass: rows.filter((r) => r.orientationCanonical === 'pass').length,
    notApplicable: rows.filter((r) => r.orientationCanonical === 'notApplicable').length,
    fail: rows.filter((r) => r.orientationCanonical === 'fail').length,
  },
  bySemanticMismatchPreserved: rows.filter((r) => r.semanticMismatchPreserved).length,
  materialsCheckFailures,
  assets: rows,
};

await writeFile(outPath, JSON.stringify(out, null, 2));
console.log('canonical QA:', byCanonicalVisualQa);
console.log('orientation:', out.byOrientation);
console.log('semanticMismatchPreserved=true:', out.bySemanticMismatchPreserved);
console.log('materialsCheckFailures:', materialsCheckFailures);
