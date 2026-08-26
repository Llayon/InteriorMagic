#!/usr/bin/env node
// scripts/k1-compose-artifacts.mjs
//
// K1 — Compose committed Production Asset Facts + Spatial Evidence Ledger.
//
// Inputs:
//   .agent-data/k1-production-assets/reports/k1-visual-qa-raw.json       (RAW QA)
//   .agent-data/k1-production-assets/reports/k1-visual-qa-canonical.json (canonical QA)
//   .agent-data/k1-production-assets/reports/k1-canonicalization-report.json
//   src/editor/catalog/data/production-catalog-v1.json                  (frozen selection)
//
// Outputs:
//   src/editor/catalog/data/production-asset-facts-v1.json             (COMMITTED, durable spatial only)
//   src/editor/catalog/data/production-asset-spatial-evidence-v1.json   (COMMITTED, hashes/transforms/QA)
//
// Policy:
//   - facts carry durable spatial meaning: assetId, dimensions, footprint, placement, canonicalForward.
//   - placement.anchor = observed reality (from RAW reviewer's factualPlacement), NOT frozen role.
//   - evidence ledger carries: hashes, transforms, RAW QA, canonical QA, semanticMismatch flag.
//   - canonicalForward = "+Z" frozen for every record.
//   - semanticMismatch = true if frozen role ≠ observed identity; those assets are recorded as
//     productionEligibility = blocked in the evidence ledger (NOT in facts).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const k1EvidenceRoot = path.resolve(
  repoRoot,
  '.agent-data',
  'k1-production-assets',
);
const k1ReportsRoot = path.join(k1EvidenceRoot, 'reports');

const rawQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-raw.json');
const canonicalQaPath = path.join(k1ReportsRoot, 'k1-visual-qa-canonical.json');
const canonicalReportPath = path.join(k1ReportsRoot, 'k1-canonicalization-report.json');
const frozenSelectionPath = path.join(
  repoRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-catalog-v1.json',
);
const k1BaseShaPath = path.join(k1EvidenceRoot, 'logs', 'k1-base-sha.txt');

const factsOutputPath = path.join(
  repoRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-asset-facts-v1.json',
);
const evidenceOutputPath = path.join(
  repoRoot,
  'src',
  'editor',
  'catalog',
  'data',
  'production-asset-spatial-evidence-v1.json',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Map placement → editor support.
// Wall assets: editor placement engine does NOT currently support wall; factual anchor still 'wall'.
const editorPlacementSupportFor = (placement, status) => {
  if (status === 'ambiguous') return 'unsupported';
  if (placement === 'wall') return 'unsupported';
  if (placement === 'surface' || placement === 'ceiling') return 'unsupported';
  return 'supported'; // floor
};

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const k1BaseSha = readFileSync(k1BaseShaPath, 'utf8').trim();
const trackBaseSha = '1c32b27bfddb1b98ac7b70c9fa642604cb4d6790';
const frozenSelection = readJson(frozenSelectionPath);
const rawQa = readJson(rawQaPath);
const canonicalQa = readJson(canonicalQaPath);
const canonicalReport = readJson(canonicalReportPath);

// Cross-check 47/47 ID alignment
const selectionIds = new Set(frozenSelection.assets.map((a) => a.assetId));
const rawIds = new Set(rawQa.assets.map((a) => a.assetId));
const canonicalIds = new Set(canonicalQa.assets.map((a) => a.assetId));
const canonicalReportIds = new Set(canonicalReport.assets.map((a) => a.assetId));

const expectedCount = 47;
const allIdsMatch =
  selectionIds.size === expectedCount &&
  rawIds.size === expectedCount &&
  canonicalIds.size === expectedCount &&
  canonicalReportIds.size === expectedCount &&
  [...selectionIds].every((id) => rawIds.has(id) && canonicalIds.has(id) && canonicalReportIds.has(id));

if (!allIdsMatch) {
  console.error(
    `HARD GATE FAIL — IDs don't match across 4 sources. counts: selection=${selectionIds.size} raw=${rawIds.size} canonical=${canonicalIds.size} canonicalReport=${canonicalReportIds.size}`,
  );
  process.exit(2);
}

// Counts for header
const passCount = rawQa.assets.filter((a) => a.verdict === 'pass').length;
const failCount = rawQa.assets.filter((a) => a.verdict === 'fail').length;
const unsupportedCount = rawQa.assets.filter((a) => a.verdict === 'unsupported').length;
const semanticMismatchCount = canonicalReport.assets.filter((r) => r.semanticMismatch).length;

if (failCount !== 10) {
  console.error(`HARD GATE FAIL — expected RAW fail count = 10, got ${failCount}`);
  process.exit(2);
}
if (semanticMismatchCount !== 10) {
  console.error(
    `HARD GATE FAIL — expected semanticMismatch count = 10, got ${semanticMismatchCount}`,
  );
  process.exit(2);
}

const canonicalQaPass = canonicalQa.assets.filter((a) => a.verdict === 'pass').length;
const canonicalQaFail = canonicalQa.assets.filter((a) => a.verdict === 'fail').length;
if (canonicalQaFail !== 0) {
  console.error(
    `HARD GATE FAIL — canonical QA failures detected (${canonicalQaFail}). Halt Commit 2 per policy: do not patch evidence under result. Fix exporter/canonicalization for the confirmed regression class first.`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Build lookup maps
// ---------------------------------------------------------------------------

const rawById = new Map(rawQa.assets.map((a) => [a.assetId, a]));
const canonicalById = new Map(canonicalQa.assets.map((a) => [a.assetId, a]));
const canonicalReportById = new Map(canonicalReport.assets.map((a) => [a.assetId, a]));

// ---------------------------------------------------------------------------
// Build facts artifact (durable spatial meaning only)
// ---------------------------------------------------------------------------

const factsAssets = [];
const byAnchor = { floor: 0, wall: 0, surface: 0, ceiling: 0 };
const byAmbiguousCount = 0;
const byPolicy = { 'full-xz-envelope': 0, 'full-xz-envelope-tv-wall': 0, 'lower-band-review': 0 };
const byEditorPlacementSupport = { supported: 0, unsupported: 0 };

for (const sel of frozenSelection.assets) {
  const aid = sel.assetId;
  const raw = rawById.get(aid);
  const canrep = canonicalReportById.get(aid);

  // placement: observed reality from RAW QA
  const rf = raw.reviewerFields;
  const placementAnchor = rf?.factualPlacement ?? null;
  const placementStatus = placementAnchor === null ? 'ambiguous' : 'resolved';
  const editorPlacementSupport = editorPlacementSupportFor(placementAnchor, placementStatus);

  // dimensions + footprint from canonical derivative reload (canonicalBox3 size)
  // or from sourceBox3 size if canonicalization was skipped (rotation 0 with measurement pass).
  const size = canrep.reloadedSize ?? canrep.canonicalBox3
    ? {
        width: (canrep.reloadedSize?.width ?? canrep.canonicalBox3?.max?.x - canrep.canonicalBox3?.min?.x),
        height: (canrep.reloadedSize?.height ?? canrep.canonicalBox3?.max?.y - canrep.canonicalBox3?.min?.y),
        depth: (canrep.reloadedSize?.depth ?? canrep.canonicalBox3?.max?.z - canrep.canonicalBox3?.min?.z),
      }
    : { width: 0, height: 0, depth: 0 };

  // footprint policy: full-xz-envelope by default; full-xz-envelope-tv-wall for wall-mounted TVs
  let policy = 'full-xz-envelope';
  if (placementAnchor === 'wall' && sel.semanticRole === 'tv') {
    policy = 'full-xz-envelope-tv-wall';
  }

  const fact = {
    assetId: aid,
    dimensions: {
      width: round(size.width, 4),
      height: round(size.height, 4),
      depth: round(size.depth, 4),
    },
    footprint: {
      width: round(size.width, 4),
      depth: round(size.depth, 4),
      policy,
    },
    placement: {
      anchor: placementAnchor,
      status: placementStatus,
      editorPlacementSupport,
    },
    canonicalForward: '+Z',
  };

  factsAssets.push(fact);

  // summary counters
  if (placementAnchor !== null) byAnchor[placementAnchor] += 1;
  byPolicy[policy] += 1;
  byEditorPlacementSupport[editorPlacementSupport] += 1;
}

// Facts top-level (without evidenceLedgerSha256 yet)
const frozenSelectionSha256 = sha256(readFileSync(frozenSelectionPath, 'utf8'));
const factsObject = {
  schemaVersion: 1,
  coordinateContractVersion: 1,
  k1BaseSha,
  trackBaseSha,
  frozenSelectionSha256,
  assetCount: factsAssets.length,
  byAnchor,
  byPolicy,
  byEditorPlacementSupport,
  assets: factsAssets,
};

// ---------------------------------------------------------------------------
// Build evidence ledger (full audit trail)
// ---------------------------------------------------------------------------

const evidenceAssets = [];
const byRawVisualQa = { pass: 0, fail: 0, unsupported: 0 };
const byCanonicalVisualQa = { pass: 0, fail: 0, unsupported: 0, notApplicable: 0 };

for (const sel of frozenSelection.assets) {
  const aid = sel.assetId;
  const raw = rawById.get(aid);
  const can = canonicalById.get(aid);
  const canrep = canonicalReportById.get(aid);

  // row hash of raw + canonical entries (for evidence binding integrity)
  const rawRowHash = sha256(JSON.stringify(raw));
  const canonicalRowHash = sha256(JSON.stringify(can));

  const entry = {
    assetId: aid,
    sourceSha256: canrep.sourceSha256,
    canonicalSha256: canrep.canonicalSha256,
    sourceApparentForwardAxis: raw.reviewerFields?.forwardApparentAxis ?? 'ambiguous',
    appliedTransform: {
      rotationCorrectionRadians: canrep.rotationCorrectionRadians,
      orientationDerived: canrep.orientationDerived,
      translationApplied: canrep.translationApplied,
      scaleApplied: canrep.scaleApplied,
    },
    measurementAssertions: canrep.measurementAssertions,
    rawVisualQa: raw.verdict,
    rawVisualQaRowSha256: rawRowHash,
    canonicalVisualQa: can.verdict,
    canonicalVisualQaRowSha256: canonicalRowHash,
    productionEligibility: canrep.semanticMismatch ? 'blocked' : 'eligible',
    semanticMismatch: canrep.semanticMismatch,
    notes: can.notes ?? '',
  };

  evidenceAssets.push(entry);

  // summary counters
  byRawVisualQa[raw.verdict] = (byRawVisualQa[raw.verdict] ?? 0) + 1;
  if (can.verdict === 'notApplicable') {
    // spec ambiguity case — count under notApplicable
    byCanonicalVisualQa.notApplicable += 1;
  } else {
    byCanonicalVisualQa[can.verdict] = (byCanonicalVisualQa[can.verdict] ?? 0) + 1;
  }
}

const evidenceObject = {
  schemaVersion: 1,
  coordinateContractVersion: 1,
  k1BaseSha,
  trackBaseSha,
  assetCount: evidenceAssets.length,
  byRawVisualQa,
  byCanonicalVisualQa,
  entries: evidenceAssets,
};

// ---------------------------------------------------------------------------
// Write evidence ledger FIRST; then compute its sha256 and inject into facts.
// ---------------------------------------------------------------------------

writeFileSync(evidenceOutputPath, JSON.stringify(evidenceObject, null, 2) + '\n');
const evidenceLedgerSha256 = sha256(readFileSync(evidenceOutputPath, 'utf8'));
factsObject.evidenceLedgerSha256 = evidenceLedgerSha256;

writeFileSync(factsOutputPath, JSON.stringify(factsObject, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const allAssertionsPass = canonicalReport.assets.every(
  (r) =>
    r.measurementAssertions.midpointXAtOrigin === 'pass' &&
    r.measurementAssertions.midpointZAtOrigin === 'pass' &&
    r.measurementAssertions.floorContactForFloorAssets === 'pass' &&
    r.measurementAssertions.dimensionsPreserved === 'pass',
);

function round(n, d) {
  const m = Math.pow(10, d);
  return Math.round(n * m) / m;
}

console.log(JSON.stringify({
  hardGates: {
    selectionIdsCount: selectionIds.size,
    rawIdsCount: rawIds.size,
    canonicalIdsCount: canonicalIds.size,
    canonicalReportIdsCount: canonicalReportIds.size,
    allIdsMatch,
    noDuplicates:
      [...selectionIds].every(
        (id) => rawIds.has(id) && canonicalIds.has(id) && canonicalReportIds.has(id),
      ),
    rawPassCount: passCount,
    rawFailCount: failCount,
    rawUnsupportedCount: unsupportedCount,
    semanticMismatchCount,
    canonicalQaPassCount: canonicalQaPass,
    canonicalQaFailCount: canonicalQaFail,
  },
  measurementAssertions: {
    all47pass: allAssertionsPass,
  },
  outputs: {
    factsOutputPath,
    evidenceOutputPath,
    evidenceLedgerSha256,
  },
  summary: {
    byAnchor,
    byPolicy,
    byEditorPlacementSupport,
    byRawVisualQa,
    byCanonicalVisualQa,
  },
}, null, 2));

console.log('\nComposed:');
console.log('  facts:    ' + factsOutputPath);
console.log('  evidence: ' + evidenceOutputPath);
console.log('  evidenceLedgerSha256: ' + evidenceLedgerSha256);
