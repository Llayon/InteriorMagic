// tests/catalog/k1-spatial-facts.test.mjs
//
// K1 — Hermetic CI test for the three committed artifacts:
//   src/editor/catalog/data/production-catalog-v1.json (Frozen Selection)
//   src/editor/catalog/data/production-asset-facts-v1.json (FACTS)
//   src/editor/catalog/data/production-asset-spatial-evidence-v1.json (EVIDENCE)
//
// All three are COMMITTED JSON files; tests read them and assert shape +
// cross-file cardinality + frozenSelectionSha256 binding.
//
// STRICT HERMETIC RULE:
//   This test MUST NEVER read `.agent-data`, source GLBs, or canonical GLBs.
//   All hash + measurement verification belongs to the upstream test
//   `tests/catalog/upstream/k1-spatial-facts.test.mjs` (not added in K1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDir, '..', '..');
const SELECTION_PATH = path.join(
  repositoryRoot,
  'src', 'editor', 'catalog', 'data', 'production-catalog-v1.json',
);
const FACTS_PATH = path.join(
  repositoryRoot,
  'src', 'editor', 'catalog', 'data', 'production-asset-facts-v1.json',
);
const EVIDENCE_PATH = path.join(
  repositoryRoot,
  'src', 'editor', 'catalog', 'data', 'production-asset-spatial-evidence-v1.json',
);

const isSha256Hex = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

const loadJson = async (p) => {
  // Read raw bytes for SHA consistency with the composer's byte-level
  // hash binding; parse JSON separately for structural assertions.
  const raw = await readFile(p);
  return { bytes: raw, data: JSON.parse(raw.toString('utf8')) };
};

const DEEP_FORBIDDEN_FACTS_FIELDS = [
  'assetRevisionId', 'modelUrl', 'signedUrl', 'r2Key',
  'sourceCategory', 'realWorldScale', 'plannerEligible', 'arEnabled',
  'semanticRole', 'rawVisualQa', 'canonicalVisualQa',
  'sourceSha256', 'canonicalSha256', 'productionEligibility',
];
const DEEP_FORBIDDEN_EVIDENCE_FIELDS = [
  'modelUrl', 'signedUrl', 'r2Key', 'realWorldScale',
  'plannerEligible', 'arEnabled', 'productionEligibility',
];

const collectForbiddenKeyPaths = (node, basePath, forbidden) => {
  const hits = [];
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (forbidden.includes(key)) hits.push(`${basePath}.${key}`.replace(/^\./, ''));
      hits.push(...collectForbiddenKeyPaths(value, basePath ? `${basePath}.${key}` : key, forbidden));
    }
  }
  return hits;
};

const PLACEMENT_ANCHORS = ['floor', 'wall', 'surface', 'ceiling'];
const PLACEMENT_STATUSES = ['resolved', 'ambiguous', 'unsupported'];
const FOOTPRINT_POLICIES = ['full-xz-envelope', 'full-xz-envelope-tv-wall', 'lower-band-review'];
const FORWARD_AXES = ['+X', '-X', '+Z', '-Z', 'ambiguous'];
const VISUAL_QA_VERDICTS = ['pass', 'fail', 'unsupported'];

let selectionCache = null;
let factsCache = null;
let evidenceCache = null;
const load = async (path, key) => {
  if (key === 'selection' && !selectionCache) selectionCache = await loadJson(path);
  else if (key === 'facts' && !factsCache) factsCache = await loadJson(path);
  else if (key === 'evidence' && !evidenceCache) evidenceCache = await loadJson(path);
  return key === 'selection' ? selectionCache : key === 'facts' ? factsCache : evidenceCache;
};

// ----------------------------------------------------------------------------
// HERMETIC CARDINALITY GATE — Selection ⊂ Facts ⊂ Evidence
// ----------------------------------------------------------------------------

test('K1 cardinality: Selection IDs == Facts IDs == Evidence IDs (exactly 47, no duplicates)', async () => {
  const sel = await load(SELECTION_PATH, 'selection');
  const facts = await load(FACTS_PATH, 'facts');
  const evid = await load(EVIDENCE_PATH, 'evidence');

  const selIds = sel.data.assets.map((a) => a.assetId);
  const factIds = facts.data.assets.map((a) => a.assetId);
  const evIds = evid.data.entries.map((e) => e.assetId);

  assert.equal(new Set(selIds).size, 47, `Selection must have 47 unique IDs; got ${new Set(selIds).size}.`);
  assert.equal(new Set(factIds).size, 47, `Facts must have 47 unique IDs; got ${new Set(factIds).size}.`);
  assert.equal(new Set(evIds).size, 47, `Evidence must have 47 unique IDs; got ${new Set(evIds).size}.`);

  assert.deepEqual(new Set(selIds), new Set(factIds), 'Selection ID set must equal Facts ID set.');
  assert.deepEqual(new Set(selIds), new Set(evIds), 'Selection ID set must equal Evidence ID set.');

  // Same deterministic ordering.
  assert.deepEqual(selIds.slice().sort(), factIds.slice().sort());
  assert.deepEqual(selIds.slice().sort(), evIds.slice().sort());
});

test('K1 cardinality: facts.frozenSelectionSha256 matches actual sha256 of production-catalog-v1.json bytes', async () => {
  const facts = await load(FACTS_PATH, 'facts');
  const expected = createHash('sha256').update(selectionCache.bytes).digest('hex');
  assert.equal(
    facts.data.frozenSelectionSha256,
    expected,
    `facts.frozenSelectionSha256 must equal sha256 of production-catalog-v1.json bytes. ` +
      `Expected ${expected}, got ${facts.data.frozenSelectionSha256}.`,
  );
});

test('K1 cardinality: evidence.frozenSelectionSha256 matches facts.frozenSelectionSha256', async () => {
  const facts = await load(FACTS_PATH, 'facts');
  const evid = await load(EVIDENCE_PATH, 'evidence');
  assert.equal(evid.data.frozenSelectionSha256, facts.data.frozenSelectionSha256);
});

// ----------------------------------------------------------------------------
// FACTS — durable spatial only.
// ----------------------------------------------------------------------------

test('K1 facts: schemaVersion===1 and coordinateContractVersion===1', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  assert.equal(f.schemaVersion, 1);
  assert.equal(f.coordinateContractVersion, 1);
});

test('K1 facts: assetCount===47 and assets.length===47', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  assert.equal(f.assetCount, 47);
  assert.equal(f.assets.length, 47);
});

test('K1 facts: no duplicate assetIds', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const ids = f.assets.map((a) => a.assetId);
  assert.equal(new Set(ids).size, ids.length);
});

test('K1 facts: per-asset dimensions are finite && > 0', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    assert.ok(Number.isFinite(a.dimensions.width) && a.dimensions.width > 0, `${a.assetId}: width`);
    assert.ok(Number.isFinite(a.dimensions.height) && a.dimensions.height > 0, `${a.assetId}: height`);
    assert.ok(Number.isFinite(a.dimensions.depth) && a.dimensions.depth > 0, `${a.assetId}: depth`);
  }
});

test('K1 facts: per-asset footprint dimensions are finite && > 0', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    assert.ok(a.footprint.width > 0, `${a.assetId}: footprint.width`);
    assert.ok(a.footprint.depth > 0, `${a.assetId}: footprint.depth`);
  }
});

test('K1 facts: footprint.width <= dimensions.width and same for depth', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    assert.ok(a.footprint.width <= a.dimensions.width + 1e-6,
      `${a.assetId}: footprint.width (${a.footprint.width}) must be <= dimensions.width (${a.dimensions.width}).`);
    assert.ok(a.footprint.depth <= a.dimensions.depth + 1e-6,
      `${a.assetId}: footprint.depth must be <= dimensions.depth.`);
  }
});

test('K1 facts: footprint.policy is one of the enum values', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    assert.ok(FOOTPRINT_POLICIES.includes(a.footprint.policy), `${a.assetId}: ${a.footprint.policy}`);
  }
});

test('K1 facts: placement.anchor enum (incl null when status==ambiguous or unsupported)', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    const ok = a.placement.anchor === null || PLACEMENT_ANCHORS.includes(a.placement.anchor);
    assert.ok(ok, `${a.assetId}: anchor=${a.placement.anchor}`);
  }
});

test('K1 facts: placement.editorPlacementSupport enum and ties to ambiguous status', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    assert.ok(['supported', 'unsupported'].includes(a.placement.editorPlacementSupport),
      `${a.assetId}: editorPlacementSupport=${a.placement.editorPlacementSupport}`);
    if (a.placement.status === 'ambiguous' || a.placement.status === 'unsupported') {
      assert.equal(a.placement.anchor, null,
        `${a.assetId}: ambiguous/unsupported must have anchor=null.`);
      assert.equal(a.placement.editorPlacementSupport, 'unsupported',
        `${a.assetId}: ambiguous/unsupported must have editorPlacementSupport=unsupported.`);
    }
  }
});

test('K1 facts: every record carries canonicalForward === "+Z" (frozen)', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  for (const a of f.assets) {
    assert.equal(a.canonicalForward, '+Z');
  }
});

test('K1 facts: deep scan finds NO forbidden fields on facts records', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const hits = collectForbiddenKeyPaths(f.assets, 'assets', DEEP_FORBIDDEN_FACTS_FIELDS);
  assert.equal(hits.length, 0, `forbidden fields present: ${JSON.stringify(hits)}`);
});

test('K1 facts: top-level artifact also has NO forbidden fields', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const hits = collectForbiddenKeyPaths(
    { ...f, assets: undefined }, // skip assets (covered by per-record test)
    '',
    DEEP_FORBIDDEN_FACTS_FIELDS,
  );
  assert.equal(hits.length, 0, `top-level forbidden fields: ${JSON.stringify(hits)}`);
});

test('K1 facts: deterministic ordering — assets sorted by assetId', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const ids = f.assets.map((a) => a.assetId);
  const sorted = ids.slice().sort();
  assert.deepEqual(ids, sorted, 'assets array must be sorted by assetId.');
});

test('K1 facts: evidenceLedgerSha256 is a 64-char hex string AND matches the committed ledger file', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const e = await load(EVIDENCE_PATH, 'evidence');
  assert.ok(isSha256Hex(f.evidenceLedgerSha256),
    `evidenceLedgerSha256 must be 64-char hex; got ${f.evidenceLedgerSha256}`);
  assert.equal(f.evidenceLedgerSha256, createHash('sha256').update(e.bytes).digest('hex'),
    'evidenceLedgerSha256 must match sha256 of production-asset-spatial-evidence-v1.json bytes.');
});

test('K1 facts: byStatus sums to 47', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const sum = PLACEMENT_STATUSES.reduce((s, k) => s + (f.byStatus?.[k] ?? 0), 0);
  assert.equal(sum, 47, `byStatus entries must sum to 47; got ${sum}.`);
});

test('K1 facts: byPolicy and byEditorPlacementSupport both sum to 47', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const sumPolicy = FOOTPRINT_POLICIES.reduce((s, k) => s + (f.byPolicy?.[k] ?? 0), 0);
  assert.equal(sumPolicy, 47, `byPolicy entries must sum to 47; got ${sumPolicy}.`);
  const sumSupp = Object.values(f.byEditorPlacementSupport ?? {}).reduce((s, n) => s + n, 0);
  assert.equal(sumSupp, 47, `byEditorPlacementSupport entries must sum to 47; got ${sumSupp}.`);
});

test('K1 facts: byAnchor entries (where non-null) sum to status=resolved count', async () => {
  const f = (await load(FACTS_PATH, 'facts')).data;
  const sumAnchors = PLACEMENT_ANCHORS.reduce((s, k) => s + (f.byAnchor?.[k] ?? 0), 0);
  const resolvedCount = f.byStatus?.resolved ?? 0;
  // byAnchor only counts resolved anchors; ambiguous (anchor=null) excluded.
  assert.equal(sumAnchors, resolvedCount,
    `byAnchor sum (${sumAnchors}) must equal status=resolved count (${resolvedCount}).`);
});

// ----------------------------------------------------------------------------
// EVIDENCE — non-binary ledger.
// ----------------------------------------------------------------------------

test('K1 evidence: schemaVersion===1, coordinateContractVersion===1, assetCount===47', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  assert.equal(e.schemaVersion, 1);
  assert.equal(e.coordinateContractVersion, 1);
  assert.equal(e.assetCount, 47);
  assert.equal(e.entries.length, 47);
});

test('K1 evidence: byRawVisualQa has pass|fail|unsupported keys', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const k of ['pass', 'fail', 'unsupported']) {
    assert.ok(typeof e.byRawVisualQa?.[k] === 'number', `byRawVisualQa.${k} missing`);
  }
});

test('K1 evidence: byCanonicalVisualQa has pass|fail|notApplicable keys (no literal "null" key)', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const k of ['pass', 'fail', 'notApplicable']) {
    assert.ok(typeof e.byCanonicalVisualQa?.[k] === 'number', `byCanonicalVisualQa.${k} missing`);
  }
  assert.equal(e.byCanonicalVisualQa.null, undefined, 'must not have literal "null" key.');
});

test('K1 evidence: per-entry sourceSha256 is 64-char hex; canonicalSha256 is 64-char hex', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const entry of e.entries) {
    assert.ok(isSha256Hex(entry.sourceSha256), `${entry.assetId}: sourceSha256 not 64-char hex.`);
    assert.ok(isSha256Hex(entry.canonicalSha256), `${entry.assetId}: canonicalSha256 not 64-char hex.`);
  }
});

test('K1 evidence: per-entry sourceApparentForwardAxis enum', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const entry of e.entries) {
    assert.ok(FORWARD_AXES.includes(entry.sourceApparentForwardAxis),
      `${entry.assetId}: ${entry.sourceApparentForwardAxis}`);
  }
});

test('K1 evidence: appliedTransform fields', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const entry of e.entries) {
    const at = entry.appliedTransform;
    assert.ok(typeof at.rotationCorrectionRadians === 'number');
    assert.equal(at.rotationAxis, '+Y');
    assert.ok(at.translationApplied && typeof at.translationApplied.x === 'number');
    assert.equal(at.scaleApplied, 1);
  }
});

test('K1 evidence: per-entry rawVisualQa enum and canonicalVisualQa enum and semanticMismatch boolean', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const entry of e.entries) {
    assert.ok(VISUAL_QA_VERDICTS.includes(entry.rawVisualQa),
      `${entry.assetId}: rawVisualQa=${entry.rawVisualQa}`);
    assert.ok(['pass', 'fail'].includes(entry.canonicalVisualQa),
      `${entry.assetId}: canonicalVisualQa=${entry.canonicalVisualQa}`);
    assert.equal(typeof entry.semanticMismatch, 'boolean',
      `${entry.assetId}: semanticMismatch must be boolean.`);
    // k1SpatialStatus was removed; canonicalVisualQa and semanticMismatch
    // are now the only status fields. Verify it's absent from committed JSON.
    assert.equal(entry.k1SpatialStatus, undefined,
      `${entry.assetId}: k1SpatialStatus was removed; should not be present.`);
  }
});

test('K1 evidence: deterministic ordering — entries sorted by assetId', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  const ids = e.entries.map((en) => en.assetId);
  const sorted = ids.slice().sort();
  assert.deepEqual(ids, sorted);
});

test('K1 evidence: deep scan finds NO forbidden fields on evidence entries', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  const hits = collectForbiddenKeyPaths(e.entries, 'entries', DEEP_FORBIDDEN_EVIDENCE_FIELDS);
  assert.equal(hits.length, 0, `forbidden fields: ${JSON.stringify(hits)}`);
});

test('K1 evidence: byRawVisualQa and byCanonicalVisualQa sums match per-entry counts', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  const rawCounts = { pass: 0, fail: 0, unsupported: 0 };
  for (const en of e.entries) rawCounts[en.rawVisualQa] += 1;
  assert.deepEqual(e.byRawVisualQa, rawCounts);

  const canCounts = { pass: 0, fail: 0, notApplicable: 0 };
  for (const en of e.entries) canCounts[en.canonicalVisualQa] += 1;
  assert.deepEqual(e.byCanonicalVisualQa, canCounts);
});

test('K1 evidence: bySemanticMismatch === count(entries where semanticMismatch===true)', async () => {
  const e = (await load(EVIDENCE_PATH, 'evidence')).data;
  const observed = e.entries.filter((en) => en.semanticMismatch === true).length;
  assert.equal(e.bySemanticMismatch, observed,
    `bySemanticMismatch (${e.bySemanticMismatch}) must equal observed count (${observed}).`);
});

// ----------------------------------------------------------------------------
// Selection ↔ Facts ↔ Evidence cross-artifact binding
// ----------------------------------------------------------------------------

test('K1 binding: every Selection asset has matching Facts and Evidence rows', async () => {
  const sel = (await load(SELECTION_PATH, 'selection')).data;
  const facts = (await load(FACTS_PATH, 'facts')).data;
  const evid = (await load(EVIDENCE_PATH, 'evidence')).data;
  for (const a of sel.assets) {
    assert.ok(
      facts.assets.some((f) => f.assetId === a.assetId),
      `Selection ${a.assetId}: missing from facts.`,
    );
    assert.ok(
      evid.entries.some((e) => e.assetId === a.assetId),
      `Selection ${a.assetId}: missing from evidence.`,
    );
  }
});

test('K1 binding: facts.trackBaseSha === selection.trackBaseSha', async () => {
  const sel = (await load(SELECTION_PATH, 'selection')).data;
  const facts = (await load(FACTS_PATH, 'facts')).data;
  const evid = (await load(EVIDENCE_PATH, 'evidence')).data;
  assert.equal(facts.data?.trackBaseSha ?? facts.trackBaseSha, sel.trackBaseSha,
    'facts.trackBaseSha must equal selection.trackBaseSha.');
  assert.equal(evid.data?.trackBaseSha ?? evid.trackBaseSha, sel.trackBaseSha,
    'evidence.trackBaseSha must equal selection.trackBaseSha.');
});
