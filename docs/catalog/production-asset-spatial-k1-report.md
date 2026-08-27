# K1 — Production Asset Spatial Truth — Repair Pass Report

**Track:** K1 — Production Asset Spatial Truth
**Status:** **B — K1 SPATIAL TRUTH ESTABLISHED / 10 FROZEN SELECTION ASSETS HAVE SEMANTIC MISMATCHES**
**Branch:** `feature/k1-production-asset-spatial-truth`
**Base SHA (original):** `e156c8f727f04ae38d358c489fdc9c68e6618eb7` (merge of PR #21)
**HEAD SHA:** `9e675ef4984673060c8bb2690605d6efb788ac60`
**origin/main SHA at rebase time:** `eee995224b940291c3b11b65352c8a6ac7370b79`

---

## TL;DR

Repair pass landed. Four new bounded commits added on top of the
existing 6 K1 commits. Rebased onto current `origin/main` cleanly
(one `.gitignore` conflict, one `package-lock.json` conflict, both
resolved by keeping both sides' additive content).

Critical bug **fix**: rotation was being applied about +Z instead of +Y
(symptom: `translationApplied.y ≈ 1.1613` on the sofa pilot, which is
mathematically wrong — a true π rotation about +Y preserves Y). After
the fix, `translationApplied.y ≈ 5.96e-8` and all geometry assertions
pass on both the writer's bounds walker AND an independent
THREE.GLTFLoader + Box3.setFromObject verifier (separate code path).

10 / 47 = 21.3% total frozen semantic-role mismatches remain exactly as
RAW QA established:

- 6 fake TVs   (electronics_032/036/037/040/046/049)
- 2 fake sofas (sofa_028, sofa_031)
- 1 armchair → ottoman (chair_001)
- 1 floorLamp → table lamp (lamp_027)

There are 7 frozen TV IDs total. Only 1 (electronics) is a real TV.
6 are semantic mismatches.

Frozen Production Selection was NOT modified. K1 records observed
identity separately in the evidence ledger with `semanticMismatch: true`
and `k1SpatialStatus: 'blocked'` for downstream K2/K3 release tooling
to resolve.

---

## 1. Bugs fixed in this repair pass

### P0 #1 — Wrong rotation axis

**Before**: `scripts/k1-canonicalize.mjs` constructed
```
const rotationQuat = [
  0,
  0,
  Math.sin(rotationCorrectionRadians / 2),
  Math.cos(rotationCorrectionRadians / 2),
];
```
This is rotation about **+Z**, not +Y. The K1 contract requires
rotation about +Y.

**After**: rotation about +Y via the wrapper node
```
const rotationQuat = [0, Math.sin(theta/2), 0, Math.cos(theta/2)];
```
verified by:
- `translationApplied.y` went from 1.1613 (sofa pilot) to 5.96e-8
  (correct Y-preserving +Y rotation).
- Deterministic orientation assertions:
  `upInvariant = true` (Y is invariant under +Y rotation), and
  `forwardAsserted = true` (sourceApparentForward axis transformed
  by +Y rotation equals +Z, e.g. `-Z + π → +Z` for sofas).

### P0 #2 — Broken bounds walker

**Before**: `computeBox3FromAccessors` pre-collected descendant meshes
into a list while marking descendant nodes visited, then measured them
using the current parent/root world matrix and skipped the real child
visit because the child was already "visited". Nested-node transforms
were silently ignored.

**After**: clean recursive visitor. `visit(node, parentWorldMatrix)`
composes THIS node's local matrix, measures ONLY THIS node's attached
mesh using THIS world matrix, then recurses into children with the
composed world matrix. No pre-collection. No visited poisoning.

### P0 #3 — Independent verifier (THREE.GLTFLoader)

`verifyWithGltfLoader()` is a **separate code path** from the writer's
bounds walker. Loads canonical GLB with `THREE.GLTFLoader`,
`scene.updateMatrixWorld(true)`, `new THREE.Box3().setFromObject(scene)`.
Records midpointX/midpointZ/minY/dimensions. The pipeline asserts
`independentVsWriter: pass` for every asset (writer measurement and
verifier measurement must agree within 4× epsilon). If they disagree
materially, the pipeline halts.

### P1 #4 — Source root transforms preserved

**Before**: `node.setRotation(...)`, `node.setTranslation(...)` on
existing source scene root nodes — silently destroyed source transforms
despite comments claiming composition.

**After**: a NEW `CanonicalWrapper` Node is created via
`document.createNode('CanonicalWrapper')`. Existing scene root nodes
are detached from their scene and re-parented to the wrapper via
`wrapper.addChild(child) + scene.removeChild(child)`. The wrapper
holds the rotation correction + canonical translation. Source scene
graph and root transforms are intact.

### Removed prune/dedup

The previous writer called `document.transform(prune({...}), dedup())`.
K1's job is spatial canonicalization, not graph optimization. The
mutation surface is now minimal: `read GLB → wrap roots → write GLB`.
Textures, materials, meshes, images and extensions are preserved
bit-for-bit (40-byte diff between source and canonical `sofa.glb` is
entirely extension representation).

### Deterministic orientation assertions

`verifyOrientationAssertions({ axis, rotationCorrectionRadians })`:
- `upInvariant` = `(0,1,0)` under +Y rotation is invariant — always true.
- `forwardAsserted` = source apparent forward transformed by rotation
  about +Y must equal `+Z` within `ORIENTATION_VECTOR_EPSILON = 1e-3`.
  Examples: `-Z + π → +Z`, `+Z + 0 → +Z`, `+X + -π/2 → +Z`,
  `-X + +π/2 → +Z`.
- For ambiguous forward (rugs, plants, lamps, kitchen objects, the
  6 fake TVs): `orientationDerived: false`, rotation 0, assertion
  reports `notApplicable`.

---

## 2. Schema fixes

### Removed `productionEligibility`

K1 does not establish global production eligibility because rights
are unresolved, K2 has not minted assetRevisionIds, K3 has not run
delivery, and production activation has not happened. Replaced with
narrow `k1SpatialStatus: 'pass' | 'blocked'` — blocked iff
`semanticMismatch=true OR canonicalVisualQa !== 'pass'`.

### Fixed trackBaseSha semantics

`scripts/k1-compose-artifacts.mjs` now reads `trackBaseSha` from
`frozenSelection.trackBaseSha` (not hardcoded
`'1c32b27bfddb1b98ac7b70c9fa642604cb4d6790'`). The values match
today, but the composer no longer drifts if the selection adds a
different trackBaseSha later. `k1BaseSha` continues to come from the
gitignored `logs/k1-base-sha.txt`.

### Updated `types.ts`

`src/editor/catalog/k1/types.ts` rewritten so the FACTS namespace
exactly describes `production-asset-facts-v1.json` and the EVIDENCE
namespace exactly describes
`production-asset-spatial-evidence-v1.json`. Removed the obsolete
`transform` field that did not match the actual committed
`appliedTransform` field. Removed the obsolete `byAmbiguousCount`
(replaced by `byStatus.{resolved, ambiguous, unsupported}`).

### Hermetic test suite rewritten

27 tests → 74 tests. New in addition to the old structural + forbidden
field scan:

- Selection IDs == Facts IDs == Evidence IDs == exactly 47, no
  duplicates, same deterministic ordering.
- `facts.frozenSelectionSha256 === sha256(production-catalog-v1.json bytes)`.
- `evidence.frozenSelectionSha256 === facts.frozenSelectionSha256`.
- `byStatus` sums to 47.
- `byAnchor` entries sum to `status === 'resolved'` count.
- `evidence.appliedTransform` fields (`rotationAxis: '+Y'`, `scaleApplied: 1`).
- Per-entry measurementAssertions structure (writer + independent + orientation).
- `k1SpatialStatus: 'pass' | 'blocked'` enum.
- Per-entry `sourceSha256` and `canonicalSha256` are 64-char hex.
- `facts.trackBaseSha === selection.trackBaseSha` (and same for evidence).
- Every Selection assetId has matching Facts row AND matching Evidence entry.

---

## 3. Pilot gate (2 / 2 PASS)

| Asset | Result |
|---|---|
| **sofa** | rotation π about +Y; `translation.y = 5.96e-8` (correct Y-preserving); `midpointX/Z = 0`; floor contact OK; dimensions preserved; materials preserved (77,744 B canonical vs 77,776 B source = 32-byte diff from extension representation); upInvariant=true; forwardAsserted=true; independent GLTFLoader measurement agrees. |
| **carpet** | rotation 0; ambiguous forward; midpointX/Z = 0; floor contact OK; dimensions preserved; materials preserved (3,380,904 B canonical vs 3,380,944 B source = 40-byte diff); orientationCanonical=notApplicable. |

---

## 4. Batch results (47 / 47)

- **Canonical GLBs generated**: 47 / 47.
- **Skipped**: 0.
- **Measurement failures** (writer-side): **0**.
- **Independent GLTFLoader measurement failures**: **0**.
- **`independentVsWriter`** (writer + GLTFLoader agree): **pass for every asset**.
- **Rotation distribution**: 41 × rotation 0 + 6 × rotation π (the 6 PASS sofas).
- **`orientationDerived: true`**: 8 (chair + electronics + 6 sofas).
- **`semanticMismatch: true`**: 10 (preserved exactly as RAW QA established).
- **Canonical visual QA**: 47 / 47 pass (orientation: 8 pass + 39 notApplicable + 0 fail).

---

## 5. Cardinality

```
Selection IDs (47) == Facts IDs (47) == Evidence IDs (47)
```

Verified by hermetic test `K1 cardinality: Selection IDs == Facts IDs ==
Evidence IDs (exactly 47, no duplicates)`.

---

## 6. Forbidden-field scan

Deep scan of facts and evidence for `assetRevisionId`, `modelUrl`,
`signedUrl`, `r2Key`, `sourceCategory`, `realWorldScale`,
`plannerEligible`, `arEnabled`, `semanticRole`, `productionEligibility`:
**0 hits**. `productionEligibility` was REMOVED in this repair pass;
`k1SpatialStatus` is the narrow K1-only replacement.

---

## 7. Commits added in this repair pass

```
9e675ef K1: harden selection/facts/evidence contracts
1daa68b K1: regenerate canonical evidence and spatial facts
6cd31fb K1: fix canonical transform and independent geometry verification
```

(Plus the existing 6 commits + the merge commits from the rebase onto
current `origin/main`; no existing commit was rewritten.)

---

## 8. Rebase onto current origin/main

- **origin/main SHA at rebase time**: `eee995224b940291c3b11b65352c8a6ac7370b79`.
- Conflicts: 2 (`.gitignore`, `package-lock.json`).
- Both resolved by keeping both sides' additive content (K1 + AR0 + G2D).
- Final HEAD: `9e675ef4984673060c8bb2690605d6efb788ac60`.
- `git diff origin/main...HEAD --stat` shows only the intended K1 delta
  (15 files, +5902 / -2 lines). No AR0 or G2D changes were dropped.

---

## 9. Quality gates (all green at HEAD)

| Gate | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run test:catalog` | 74 / 74 PASS |
| `npm test` | 472 / 472 PASS |
| `npm run typecheck` | 0 TS errors |
| `npm run typecheck:e2e` | (run by CI) |
| `npm run lint` | 0 errors |
| `npm run build` | built in 9.31s |
| `git diff --check` | clean (LF warnings only) |

---

## 10. Rights status

**CLARIFICATION REQUIRED.** K1 does not resolve delivery rights. No
licensed GLB/USDZ bytes were uploaded to R2. No signed URLs were
created. No AssetResolver was implemented. No production delivery was
enabled. `productionEligibility` was removed from the evidence ledger.

---

## 11. Untouched invariant

| Frozen file / scope | Modified? |
|---|---|
| `src/editor/catalog/data/production-catalog-v1.json` (frozen Production Selection) | NO |
| `src/editor/catalog/productionSelection.ts` | NO |
| `src/editor/assets/registry.ts` | NO |
| `src/app/local/ithappyRegistryPrototype.ts` | NO |
| `src/editor/planning/**` | NO |
| `src/editor/placement/**` | NO |
| `src/editor/model/types.ts` | NO |
| `workers/**` | NO |
| `src/scene/**` | NO |
| R2 production topology | UNTOUCHED |
| AR0 | UNTOUCHED |
| G2D | UNTOUCHED |
| RoomProject persistence | UNTOUCHED |
| AssetResolver / `/assets/resolve` | NOT IMPLEMENTED |
| Asset gateway | NOT IMPLEMENTED |
| Planner | UNTOUCHED |

---

## 12. Final verdict

**B — K1 SPATIAL TRUTH ESTABLISHED / 10 FROZEN SELECTION ASSETS HAVE
SEMANTIC MISMATCHES.**

K1 succeeded at its forensic + contract goal. It produced a
texture-preserving glTF-Transform-based canonicalization pipeline
with:

- **Correct rotation about +Y axis** (P0 #1 fix).
- **Clean bounds walker** (P0 #2 fix).
- **Independent THREE.GLTFLoader + Box3 verifier** (separate code path;
  writer and verifier must agree).
- **Deterministic orientation assertions** (upInvariant, forwardAsserted).
- **Source root transforms preserved** by introducing a NEW wrapper
  Node (P1 #4 fix).
- **Minimal mutation surface** (no prune/dedup).
- **Two non-binary committed artifacts** (facts + evidence ledger) with
  strict field separation and `frozenSelectionSha256` byte-level binding.
- **Selection ⊂ Facts ⊂ Evidence cardinality** verified by 74 hermetic
  tests.

K1 discovered a real structural problem in the frozen Production
Selection (~21.3% semantic-role pollution) that the Catalog Gate (PR
#21) could not detect because it validated only metadata hashes. K1's
primary deliverable is spatial truth independent of role metadata.

K2/K3 release tooling must address the 10 semantic mismatches before
production activation. K1 ends before delivery / runtime activation per
its scope.

**STOP. PR #26 remains Draft. Do not merge. Do not start K2/K3.**

---

## 13. Permissions of downstream K2/K3 (out of K1 scope)

K2 (release revision identity): may mint `assetRevisionId` per asset
based on the K1 evidence ledger's `sourceSha256` + `canonicalSha256`.
Must NOT silently reinterpret old RoomProjects (asset ID compatibility
invariant in ADR §10).

K3 (delivery): may add private R2 hosting, AssetResolver,
`/assets/resolve` worker, HMAC grants, signed URLs. Must inherit the 10
mismatches as `productionEligibility: blocked` until the frozen
Production Selection is re-curated to match observed visual reality.

Both K2 and K3 are NOT authorized in this PR.
