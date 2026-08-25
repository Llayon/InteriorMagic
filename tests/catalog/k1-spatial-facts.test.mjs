// tests/catalog/k1-spatial-facts.test.mjs
//
// K1 — Hermetic CI test for the committed facts artifact and committed
// non-binary evidence ledger (Plan Task 5.1, Amended v3).
//
// STRICT HERMETIC RULE (Plan v3 #4 / A21):
//   This file MUST NEVER read `.agent-data`, even conditionally. No
//   `existsSync('.agent-data/...')` branch. No `readFileSync` of any
//   `.agent-data/` path. No gating on filesystem checks against `.agent-data`.
//   All actual local report / canonical GLB / source GLB hash verification
//   belongs ONLY in `tests/catalog/upstream/k1-spatial-facts.test.mjs`.
//
// This test reads ONLY the two committed JSON artifacts in
// `src/editor/catalog/data/`:
//   - production-asset-facts-v1.json            (committed in Commit 2)
//   - production-asset-spatial-evidence-v1.json (committed in Commit 2)
//
// In Commit 1, those files DO NOT EXIST YET, so this test is INTENTIONALLY RED.
// The expected failure mode is a clear "facts artifact not found" assertion so
// the red is unambiguous and self-explanatory. Commit 2 makes the same test
// GREEN by committing the two artifacts.
//
// Each test name states what it asserts and each `assert` message explains
// the expected invariant, so a failure makes the contract violation obvious.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// Paths — committed files only.
// ----------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
// tests/catalog/ → repo root
const repositoryRoot = path.resolve(testDir, '..', '..');
const FACTS_PATH = path.join(
  repositoryRoot,
  'src', 'editor', 'catalog', 'data', 'production-asset-facts-v1.json',
);
const EVIDENCE_PATH = path.join(
  repositoryRoot,
  'src', 'editor', 'catalog', 'data', 'production-asset-spatial-evidence-v1.json',
);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const isSha256Hex = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

const loadJsonOrFailRed = async (p, label) => {
  // This is NOT a `.agent-data` read; the path is under `src/editor/catalog/data/`.
  // The failure mode is the intentional RED in Commit 1.
  let raw;
  try {
    raw = await readFile(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new assert.AssertionError({
        message: `K1 hermetic RED: ${label} artifact not found at ${p}. This file is COMMITTED in Commit 2, not Commit 1.`,
        actual: 'missing',
        expected: 'committed',
        operator: 'existsSync (committed file only)',
      });
    }
    throw err;
  }
  return JSON.parse(raw);
};

const sha256OfFile = async (p) => {
  const buf = await readFile(p);
  return createHash('sha256').update(buf).digest('hex');
};

const DEEP_FORBIDDEN_FIELDS = [
  'assetRevisionId',
  'modelUrl',
  'signedUrl',
  'r2Key',
  'sourceCategory',
  'realWorldScale',
  'plannerEligible',
  'arEnabled',
  'plannerApplicable',
];

const FACTS_DEEP_FORBIDDEN_FIELDS = [
  ...DEEP_FORBIDDEN_FIELDS,
  // facts-specific (already forbidden everywhere, but doubled here for clarity):
  'semanticRole',
  'rawSourceSha256',
  'canonicalSha256',
  'sourceApparentForwardAxis',
  'rotationCorrectionRadians',
  'visualQaVerdict',
  'forwardEvidence',
];

const EVIDENCE_DEEP_FORBIDDEN_FIELDS = [
  ...DEEP_FORBIDDEN_FIELDS,
];

// Deep scan: walk an object recursively, return all key paths that contain a forbidden name.
const collectForbiddenKeyPaths = (node, basePath = '', forbidden = DEEP_FORBIDDEN_FIELDS) => {
  const hits = [];
  if (node === null || typeof node !== 'object') return hits;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      hits.push(...collectForbiddenKeyPaths(node[i], `${basePath}[${i}]`, forbidden));
    }
    return hits;
  }
  for (const [key, value] of Object.entries(node)) {
    if (forbidden.includes(key)) hits.push(`${basePath}.${key}`.replace(/^\./, ''));
    hits.push(...collectForbiddenKeyPaths(value, basePath ? `${basePath}.${key}` : key, forbidden));
  }
  return hits;
};

// ----------------------------------------------------------------------------
// Tests — committed facts artifact
// ----------------------------------------------------------------------------

test('K1 facts: schemaVersion===1 and coordinateContractVersion===1', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  assert.equal(facts.schemaVersion, 1,
    `facts.schemaVersion must be 1 (frozen). Got ${facts.schemaVersion}.`);
  assert.equal(facts.coordinateContractVersion, 1,
    `facts.coordinateContractVersion must be 1 (frozen). Got ${facts.coordinateContractVersion}.`);
});

test('K1 facts: assetCount===47 and assets.length===47', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  assert.equal(facts.assetCount, 47,
    `facts.assetCount must be 47 (frozen selection size). Got ${facts.assetCount}.`);
  assert.ok(Array.isArray(facts.assets),
    `facts.assets must be an array. Got ${typeof facts.assets}.`);
  assert.equal(facts.assets.length, facts.assetCount,
    `facts.assets.length (${facts.assets.length}) must equal facts.assetCount (${facts.assetCount}).`);
});

test('K1 facts: no duplicate assetIds', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const ids = facts.assets.map((a) => a.assetId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.equal(dupes.length, 0,
    `Found duplicate assetIds in facts.assets: ${[...new Set(dupes)].join(', ')}`);
});

test('K1 facts: per-asset dimensions are finite && > 0 (Plan v3 #5 — no arbitrary range)', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  for (const a of facts.assets) {
    const { width, height, depth } = a.dimensions ?? {};
    assert.ok(width !== undefined && height !== undefined && depth !== undefined,
      `asset ${a.assetId}: dimensions fields missing.`);
    for (const [axis, value] of [['width', width], ['height', height], ['depth', depth]]) {
      assert.ok(Number.isFinite(value) && value > 0,
        `asset ${a.assetId}: dimensions.${axis} must be finite && > 0 (Plan v3 #5). Got ${value}.`);
    }
  }
});

test('K1 facts: per-asset footprint dimensions are finite && > 0', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  for (const a of facts.assets) {
    const { width, depth } = a.footprint ?? {};
    assert.ok(width !== undefined && depth !== undefined,
      `asset ${a.assetId}: footprint width/depth missing.`);
    for (const [axis, value] of [['width', width], ['depth', depth]]) {
      assert.ok(Number.isFinite(value) && value > 0,
        `asset ${a.assetId}: footprint.${axis} must be finite && > 0. Got ${value}.`);
    }
  }
});

test('K1 facts: footprint.width <= dimensions.width + DIMENSION_EPSILON_M and same for depth', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const DIMENSION_EPSILON_M = 0.01;
  for (const a of facts.assets) {
    assert.ok(a.footprint.width <= a.dimensions.width + DIMENSION_EPSILON_M,
      `asset ${a.assetId}: footprint.width (${a.footprint.width}) must be <= dimensions.width (${a.dimensions.width}) + ${DIMENSION_EPSILON_M}`);
    assert.ok(a.footprint.depth <= a.dimensions.depth + DIMENSION_EPSILON_M,
      `asset ${a.assetId}: footprint.depth (${a.footprint.depth}) must be <= dimensions.depth (${a.dimensions.depth}) + ${DIMENSION_EPSILON_M}`);
  }
});

test('K1 facts: footprint.policy is one of the three enum values', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const ALLOWED = new Set(['full-xz-envelope', 'full-xz-envelope-tv-wall', 'lower-band-review']);
  for (const a of facts.assets) {
    assert.ok(ALLOWED.has(a.footprint?.policy),
      `asset ${a.assetId}: footprint.policy must be one of ${[...ALLOWED].join(' | ')}. Got ${a.footprint?.policy}.`);
  }
});

test('K1 facts: placement.anchor enum (incl null when status==ambiguous)', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const ALLOWED = new Set(['floor', 'wall', 'surface', 'ceiling', null]);
  for (const a of facts.assets) {
    assert.ok('anchor' in (a.placement ?? {}),
      `asset ${a.assetId}: placement.anchor missing.`);
    assert.ok(ALLOWED.has(a.placement.anchor),
      `asset ${a.assetId}: placement.anchor must be one of floor|wall|surface|ceiling|null. Got ${a.placement.anchor}.`);
    if (a.placement.status === 'ambiguous') {
      assert.equal(a.placement.anchor, null,
        `asset ${a.assetId}: placement.anchor must be null when status==='ambiguous'. Got ${a.placement.anchor}.`);
    } else if (a.placement.status === 'resolved') {
      assert.ok(a.placement.anchor !== null,
        `asset ${a.assetId}: placement.anchor must be non-null when status==='resolved'.`);
    }
  }
});

test('K1 facts: placement.editorPlacementSupport enum and ties to ambiguous status', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const ALLOWED = new Set(['supported', 'unsupported']);
  for (const a of facts.assets) {
    const support = a.placement?.editorPlacementSupport;
    assert.ok(ALLOWED.has(support),
      `asset ${a.assetId}: placement.editorPlacementSupport must be supported|unsupported. Got ${support}.`);
    if (a.placement?.status === 'ambiguous') {
      assert.equal(support, 'unsupported',
        `asset ${a.assetId}: when status==='ambiguous', editorPlacementSupport must be 'unsupported'. Got ${support}.`);
    }
  }
});

test('K1 facts: every record carries canonicalForward === "+Z" (frozen)', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  for (const a of facts.assets) {
    assert.equal(a.canonicalForward, '+Z',
      `asset ${a.assetId}: canonicalForward must be "+Z" (frozen per ADR §2). Got ${a.canonicalForward}.`);
  }
});

test('K1 facts: deep scan finds NO forbidden fields on facts records', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const hits = collectForbiddenKeyPaths(facts.assets, '', FACTS_DEEP_FORBIDDEN_FIELDS);
  assert.equal(hits.length, 0,
    `facts.assets must NOT contain any forbidden field. Found: ${hits.join(', ')}`);
});

test('K1 facts: top-level artifact also has NO forbidden fields', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  // Walk the whole artifact (excluding the assets[] deep scan done above).
  const top = { ...facts };
  delete top.assets;
  const hits = collectForbiddenKeyPaths(top, '', DEEP_FORBIDDEN_FIELDS);
  assert.equal(hits.length, 0,
    `facts top-level must NOT contain any forbidden field. Found: ${hits.join(', ')}`);
});

test('K1 facts: deterministic ordering — assets sorted by assetId', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const ids = facts.assets.map((a) => a.assetId);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted,
    'facts.assets must be sorted by assetId (deterministic ordering).');
});

test('K1 facts: evidenceLedgerSha256 is a 64-char hex string AND matches the committed ledger file', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  assert.ok(isSha256Hex(facts.evidenceLedgerSha256),
    `facts.evidenceLedgerSha256 must be a 64-char lowercase hex string. Got ${facts.evidenceLedgerSha256}.`);
  const ledgerBytes = await readFile(EVIDENCE_PATH);
  const ledgerHash = createHash('sha256').update(ledgerBytes).digest('hex');
  assert.equal(facts.evidenceLedgerSha256, ledgerHash,
    `facts.evidenceLedgerSha256 (${facts.evidenceLedgerSha256}) must equal sha256 of ${EVIDENCE_PATH} (${ledgerHash}).`);
});

test('K1 facts: byAnchor + byAmbiguousCount sums to 47', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const sumAnchors = Object.values(facts.byAnchor ?? {}).reduce((s, n) => s + n, 0);
  const ambig = facts.byAmbiguousCount ?? 0;
  assert.equal(sumAnchors + ambig, 47,
    `byAnchor sum (${sumAnchors}) + byAmbiguousCount (${ambig}) must equal 47.`);
});

test('K1 facts: byPolicy and byEditorPlacementSupport both sum to 47', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const sumPolicy = Object.values(facts.byPolicy ?? {}).reduce((s, n) => s + n, 0);
  const sumSupport = Object.values(facts.byEditorPlacementSupport ?? {}).reduce((s, n) => s + n, 0);
  assert.equal(sumPolicy, 47, `byPolicy sum must equal 47. Got ${sumPolicy}.`);
  assert.equal(sumSupport, 47, `byEditorPlacementSupport sum must equal 47. Got ${sumSupport}.`);
});

// ----------------------------------------------------------------------------
// Tests — committed non-binary evidence ledger
// ----------------------------------------------------------------------------
//
// NOTE: loadJsonOrFailRed throws AssertionError on ENOENT, so the same file-missing
// behavior propagates here. That is the intentional Commit-1 RED for the ledger too.

test('K1 evidence: schemaVersion===1, coordinateContractVersion===1, assetCount===47', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  assert.equal(ledger.schemaVersion, 1, `evidence.schemaVersion must be 1.`);
  assert.equal(ledger.coordinateContractVersion, 1, `evidence.coordinateContractVersion must be 1.`);
  assert.equal(ledger.assetCount, 47, `evidence.assetCount must be 47.`);
});

test('K1 evidence: byCanonicalVisualQa has the four explicit keys incl notApplicable (no literal "null" key)', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const keys = Object.keys(ledger.byCanonicalVisualQa ?? {});
  assert.ok(!keys.includes('null'),
    `byCanonicalVisualQa must NOT use a literal "null" key. Found keys: ${keys.join(',')}.`);
  for (const required of ['pass', 'fail', 'unsupported', 'notApplicable']) {
    assert.ok(keys.includes(required),
      `byCanonicalVisualQa must include explicit "${required}" key. Found keys: ${keys.join(',')}.`);
  }
});

test('K1 evidence: byRawVisualQa has pass|fail|unsupported keys', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const keys = Object.keys(ledger.byRawVisualQa ?? {});
  for (const required of ['pass', 'fail', 'unsupported']) {
    assert.ok(keys.includes(required),
      `byRawVisualQa must include "${required}" key. Found keys: ${keys.join(',')}.`);
  }
});

test('K1 evidence: per-entry sourceSha256 is 64-char hex; canonicalSha256 is null OR 64-char hex', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  for (const e of ledger.entries) {
    assert.ok(isSha256Hex(e.sourceSha256),
      `entry ${e.assetId}: sourceSha256 must be 64-char hex. Got ${e.sourceSha256}.`);
    if (e.canonicalSha256 !== null) {
      assert.ok(isSha256Hex(e.canonicalSha256),
        `entry ${e.assetId}: canonicalSha256 must be null OR 64-char hex. Got ${e.canonicalSha256}.`);
    }
  }
});

test('K1 evidence: per-entry sourceApparentForwardAxis enum', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const ALLOWED = new Set(['+X', '-X', '+Z', '-Z', 'ambiguous']);
  for (const e of ledger.entries) {
    assert.ok(ALLOWED.has(e.sourceApparentForwardAxis),
      `entry ${e.assetId}: sourceApparentForwardAxis must be one of ${[...ALLOWED].join('|')}. Got ${e.sourceApparentForwardAxis}.`);
  }
});

test('K1 evidence: transform is null iff canonicalSha256 is null', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  for (const e of ledger.entries) {
    if (e.canonicalSha256 === null) {
      assert.equal(e.transform, null,
        `entry ${e.assetId}: canonicalSha256===null requires transform===null.`);
    } else {
      assert.ok(e.transform && typeof e.transform === 'object',
        `entry ${e.assetId}: canonicalSha256!==null requires a non-null transform object.`);
    }
  }
});

test('K1 evidence: per-entry rawVisualQa enum', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const ALLOWED = new Set(['pass', 'fail', 'unsupported']);
  for (const e of ledger.entries) {
    assert.ok(ALLOWED.has(e.rawVisualQa),
      `entry ${e.assetId}: rawVisualQa must be pass|fail|unsupported. Got ${e.rawVisualQa}.`);
  }
});

test('K1 evidence: deterministic ordering — entries sorted by assetId', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const ids = ledger.entries.map((e) => e.assetId);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted,
    'evidence.entries must be sorted by assetId (deterministic ordering).');
});

test('K1 evidence: deep scan finds NO forbidden fields on evidence entries', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const hits = collectForbiddenKeyPaths(ledger, '', EVIDENCE_DEEP_FORBIDDEN_FIELDS);
  assert.equal(hits.length, 0,
    `evidence must NOT contain any forbidden field. Found: ${hits.join(', ')}`);
});

test('K1 evidence: byRawVisualQa and byCanonicalVisualQa sums match per-entry counts', async () => {
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  // Raw counts.
  const rawCounts = { pass: 0, fail: 0, unsupported: 0 };
  for (const e of ledger.entries) rawCounts[e.rawVisualQa] += 1;
  assert.deepEqual(rawCounts, ledger.byRawVisualQa,
    `byRawVisualQa (${JSON.stringify(ledger.byRawVisualQa)}) must match per-entry counts (${JSON.stringify(rawCounts)}).`);
  // Canonical counts: pass/fail/unsupported from canonicalVisualQa; notApplicable when canonicalSha256===null.
  const canCounts = { pass: 0, fail: 0, unsupported: 0, notApplicable: 0 };
  for (const e of ledger.entries) {
    if (e.canonicalSha256 === null) canCounts.notApplicable += 1;
    else canCounts[e.canonicalVisualQa] += 1;
  }
  assert.deepEqual(canCounts, ledger.byCanonicalVisualQa,
    `byCanonicalVisualQa (${JSON.stringify(ledger.byCanonicalVisualQa)}) must match per-entry counts (${JSON.stringify(canCounts)}).`);
});

test('K1 evidence: membership parity with facts — same assetId set, same ordering', async () => {
  const facts = await loadJsonOrFailRed(FACTS_PATH, 'facts');
  const ledger = await loadJsonOrFailRed(EVIDENCE_PATH, 'evidence');
  const factsIds = facts.assets.map((a) => a.assetId);
  const ledgerIds = ledger.entries.map((e) => e.assetId);
  assert.deepEqual(ledgerIds, factsIds,
    'evidence.entries must list the same assetIds in the same order as facts.assets.');
});
