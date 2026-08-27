#!/usr/bin/env node
// scripts/k1-compose-artifacts.mjs
//
// K1 — Compose committed Production Asset Facts + Spatial Evidence Ledger.
//
// Inputs:
//   .agent-data/k1-production-assets/reports/k1-visual-qa-raw.json       (RAW QA)
//   .agent-data/k1-production-assets/reports/k1-canonicalization-report.json
//   .agent-data/k1-production-assets/reports/k1-visual-qa-canonical.json (canonical QA)
//   src/editor/catalog/data/production-catalog-v1.json                  (frozen selection)
//
// Outputs:
//   src/editor/catalog/data/production-asset-facts-v1.json   (COMMITTED, durable spatial only)
//   src/editor/catalog/data/production-asset-spatial-evidence-v1.json (COMMITTED)
//
// Schema is verified to match src/editor/catalog/k1/types.ts (see below).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const k1EvidenceRoot = path.resolve(
  repoRoot,
  '.agent-data',
  'k1-production-assets',
);
const k1ReportsRoot = path.join(k1EvidenceRoot, 'reports');

const rawQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-raw.json');
const canonicalQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-canonical.json');
const canonicalReportPath = path.join(k1ReportsRoot, 'k1-canonicalization-report.json');
const k1BaseShaPath = path.join(k1EvidenceRoot, 'logs', 'k1-base-sha.txt');
const frozenSelectionPath = path.join(
  repoRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-catalog-v1.json',
);

const factsPath = path.join(
  repoRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-asset-facts-v1.json',
);
const evidencePath = path.join(
  repoRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-asset-spatial-evidence-v1.json',
);

// ----------------------------------------------------------------------------
// Load all inputs
// ----------------------------------------------------------------------------

const frozenSelection = JSON.parse(readFileSync(frozenSelectionPath, 'utf8'));
const canonicalReport = JSON.parse(readFileSync(canonicalReportPath, 'utf8'));
const rawQa = JSON.parse(readFileSync(rawQaPath, 'utf8'));
const canonicalQa = JSON.parse(readFileSync(canonicalQaPath, 'utf8'));

const k1BaseSha = readFileSync(k1BaseShaPath, 'utf8').trim();
// trackBaseSha = historical base stored by the frozen Production Selection.
// This is NOT the K1 execution base. Do not confuse.
const trackBaseSha = frozenSelection.trackBaseSha;

// SHA256 of the current committed frozen selection bytes.
// This is what facts/evidence bind to. If the selection changes,
// regeneration produces a different SHA256 and the hermetic gate fails.
// Read as bytes (Buffer) to be platform-independent regardless of
// local EOL conversion (.gitattributes enforces LF on this file).
const frozenSelectionBytes = readFileSync(frozenSelectionPath);
const frozenSelectionSha256 = createHash('sha256')
  .update(frozenSelectionBytes)
  .digest('hex');

const canonicalQaById = new Map(canonicalQa.assets.map((r) => [r.assetId, r]));
const rawQaById = new Map(rawQa.assets.map((r) => [r.assetId, r]));
const canonicalById = new Map(canonicalReport.assets.map((r) => [r.assetId, r]));

// ----------------------------------------------------------------------------
// Compose FACTS (durable spatial only)
// ----------------------------------------------------------------------------
// Schema (must match src/editor/catalog/k1/types.ts FACTS namespace):
//   assetId
//   dimensions: { width, height, depth }  (meters)
//   footprint:  { width, depth, policy }
//   placement:  { anchor, editorPlacementSupport, status }
//   canonicalForward: "+Z" (frozen)
//
// STRICTLY absent: semanticRole, sourceSha256, modelUrl, signedUrl,
// r2Key, sourceCategory, realWorldScale, plannerEligible, arEnabled,
// assetRevisionId, QA verdicts.
// ----------------------------------------------------------------------------

const factsAssets = [];
const byAnchor = { floor: 0, wall: 0, surface: 0, ceiling: 0 };
const byPolicy = {
  'full-xz-envelope': 0,
  'full-xz-envelope-tv-wall': 0,
  'lower-band-review': 0,
};
const byEditorPlacementSupport = { supported: 0, unsupported: 0 };
const byStatus = { resolved: 0, ambiguous: 0, unsupported: 0 };

for (const a of frozenSelection.assets) {
  const aid = a.assetId;
  const canon = canonicalById.get(aid);
  const qa = rawQaById.get(aid);

  if (!canon || canon.skipped) continue;

  const rawVerdict = qa?.verdict ?? 'unsupported';
  // observedPlacement = factual anchor determined by RAW visual review.
  // K1's contract: facts.anchor MUST be derived from RAW evidence for
  // BOTH pass and fail raw verdicts. The semanticMismatch flag (frozen
  // role != observed identity) does NOT alter placement; it is recorded
  // in evidence.semanticMismatch separately.
  const observedPlacement = qa?.reviewerFields?.factualPlacement ?? null;

  // Map observed placement → anchor enum. Same rules for all raw verdicts.
  let anchor = null;
  let status = 'resolved';
  let editorPlacementSupport = 'unsupported';
  let footprintPolicy = 'full-xz-envelope';

  if (rawVerdict === 'unsupported') {
    status = 'unsupported';
  } else if (observedPlacement === null || observedPlacement === 'ambiguous') {
    // RAW reviewer could not determine placement → ambiguous.
    status = 'ambiguous';
  } else if (observedPlacement === 'floor') {
    anchor = 'floor';
    status = 'resolved';
    editorPlacementSupport = 'supported';
  } else if (observedPlacement === 'wall') {
    anchor = 'wall';
    status = 'resolved';
    editorPlacementSupport = 'unsupported';
    // Wall-mounted assets (TV panels, monitors) — full XZ footprint
    // applies to the panel face; K1 documents this policy explicitly.
    footprintPolicy = 'full-xz-envelope-tv-wall';
  } else if (observedPlacement === 'surface') {
    anchor = 'surface';
    status = 'resolved';
    editorPlacementSupport = 'unsupported';
  } else if (observedPlacement === 'ceiling') {
    anchor = 'ceiling';
    status = 'resolved';
    editorPlacementSupport = 'unsupported';
  }

  factsAssets.push({
    assetId: aid,
    dimensions: {
      width: canon.sourceDimensions.width,
      height: canon.sourceDimensions.height,
      depth: canon.sourceDimensions.depth,
    },
    footprint: {
      width: canon.sourceDimensions.width,
      depth: canon.sourceDimensions.depth,
      policy: footprintPolicy,
    },
    placement: {
      anchor,
      status,
      editorPlacementSupport,
    },
    canonicalForward: '+Z',
  });

  if (anchor) byAnchor[anchor] += 1;
  byPolicy[footprintPolicy] += 1;
  byEditorPlacementSupport[editorPlacementSupport] += 1;
  byStatus[status] += 1;
}

const factsDoc = {
  schemaVersion: 1,
  coordinateContractVersion: 1,
  k1BaseSha,
  trackBaseSha,
  frozenSelectionSha256,
  assetCount: factsAssets.length,
  byAnchor,
  byPolicy,
  byEditorPlacementSupport,
  byStatus,
  assets: factsAssets,
  generator: {
    schema: 'production-asset-facts-v1',
    description:
      'Durable spatial facts for the 47 frozen Production Catalog v1 assets. NO hashes, NO QA verdicts, NO semanticRole, NO delivery metadata. canonicalForward is always "+Z".',
  },
};

// ----------------------------------------------------------------------------
// Compose EVIDENCE LEDGER (hashes + transforms + QA + flags)
// ----------------------------------------------------------------------------
// Schema (must match src/editor/catalog/k1/types.ts EVIDENCE namespace):
//   assetId
//   sourceSha256
//   canonicalSha256
//   sourceApparentForwardAxis
//   appliedTransform: { rotationCorrectionRadians, rotationAxis,
//                      translationApplied, scaleApplied }
//   measurementAssertions: { midpointXAtOrigin, midpointZAtOrigin,
//                           floorContactForFloorAssets, dimensionsPreserved,
//                           independentMidpointXAtOrigin, ...,
//                           orientationUpInvariant,
//                           orientationForwardAsserted }
//   rawVisualQa: 'pass' | 'fail' | 'unsupported'
//     canonicalVisualQa: 'pass' | 'fail'
//     semanticMismatch: boolean
//     productionEligibility is NOT used (K1 does not establish global eligibility;
//     rights, assetRevisionId, and delivery are out of scope).
//
// Two orthogonal axes:
//   1. spatial QA         pass | fail (canonical visual QA verdict)
//   2. semanticMismatch   true  | false (frozen role vs observed identity)
// They are reported SEPARATELY. A frozen-mismatch asset that canonicalizes
// cleanly (identity preserved, materials preserved, geometry assertions
// pass) is recorded as semanticMismatch=true + canonicalVisualQa='pass'.
// ----------------------------------------------------------------------------

const evidenceAssets = [];

for (const a of frozenSelection.assets) {
  const aid = a.assetId;
  const canon = canonicalById.get(aid);
  const qa = rawQaById.get(aid);
  const cqa = canonicalQaById.get(aid);

  if (!canon || canon.skipped) continue;

  const rawVerdict = qa?.verdict ?? 'unsupported';
  const cqaVerdict = cqa?.verdict ?? 'fail';
  const semanticMismatch = rawVerdict === 'fail';

  evidenceAssets.push({
    assetId: aid,
    sourceSha256: canon.sourceSha256,
    canonicalSha256: canon.canonicalSha256,
    sourceApparentForwardAxis: qa?.reviewerFields?.forwardApparentAxis ?? 'ambiguous',
    appliedTransform: {
      rotationCorrectionRadians: canon.rotationCorrectionRadians,
      rotationAxis: '+Y',
      translationApplied: canon.translationApplied,
      scaleApplied: 1,
    },
    measurementAssertions: canon.measurementAssertions,
    independentMeasurement: canon.independentMeasurement,
    orientationAssertions: canon.orientationAssertions,
    rawVisualQa: rawVerdict,
    canonicalVisualQa: cqaVerdict,
    semanticMismatch,
    notes: '',
  });
}

const evidenceDoc = {
  schemaVersion: 1,
  coordinateContractVersion: 1,
  k1BaseSha,
  trackBaseSha,
  frozenSelectionSha256,
  assetCount: evidenceAssets.length,
  byRawVisualQa: rawQa.byRawVisualQa ?? {
    pass: rawQa.assets.filter((r) => r.verdict === 'pass').length,
    fail: rawQa.assets.filter((r) => r.verdict === 'fail').length,
    unsupported: rawQa.assets.filter((r) => r.verdict === 'unsupported').length,
  },
  byCanonicalVisualQa: canonicalQa.byCanonicalVisualQa
    ? {
        pass: canonicalQa.byCanonicalVisualQa.pass ?? 0,
        fail: canonicalQa.byCanonicalVisualQa.fail ?? 0,
        notApplicable: canonicalQa.byCanonicalVisualQa.notApplicable ?? 0,
      }
    : { pass: 0, fail: 0, notApplicable: 0 },
  bySemanticMismatch: evidenceAssets.filter((e) => e.semanticMismatch).length,
  entries: evidenceAssets,
  generator: {
    schema: 'production-asset-spatial-evidence-v1',
    description:
      'Non-binary evidence ledger binding source/canonical hashes, transforms, measurement assertions, RAW + canonical visual QA per asset. semanticMismatch=true records observed-vs-frozen-role divergence. Two orthogonal axes are reported separately: canonicalVisualQa (spatial truth) and semanticMismatch (frozen role vs observed identity).',
  },
};

const evidenceBytes = JSON.stringify(evidenceDoc, null, 2);
const evidenceLedgerSha256 = createHash('sha256')
  .update(evidenceBytes)
  .digest('hex');
factsDoc.evidenceLedgerSha256 = evidenceLedgerSha256;

writeFileSync(factsPath, JSON.stringify(factsDoc, null, 2));
writeFileSync(evidencePath, evidenceBytes);

console.log('Composed:');
console.log(`  facts:    ${factsPath}`);
console.log(`  evidence: ${evidencePath}`);
console.log(`  evidenceLedgerSha256: ${evidenceLedgerSha256}`);
console.log(`  byAnchor: ${JSON.stringify(factsDoc.byAnchor)}`);
console.log(`  byStatus: ${JSON.stringify(factsDoc.byStatus)}`);
console.log(`  bySemanticMismatch: ${evidenceDoc.bySemanticMismatch}`);
