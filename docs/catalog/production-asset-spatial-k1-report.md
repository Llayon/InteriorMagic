# K1 — Production Asset Spatial Truth — Final Report

**Track:** K1 — Production Asset Spatial Truth
**Status:** **B — K1 SPATIAL TRUTH ESTABLISHED / 10 FROZEN SELECTION ASSETS HAVE SEMANTIC MISMATCHES**
**Branch:** `feature/k1-production-asset-spatial-truth`
**Worktree:** `.agent-worktrees/k1-production-asset-spatial-truth`
**Base SHA:** `e156c8f727f04ae38d358c489fdc9c68e6618eb7` (merge of PR #21 "Catalog: harden Production Catalog v1 gates")

---

## TL;DR

K1 establishes authoritative spatial facts for all 47 frozen Production Catalog v1 assets using a **texture-preserving glTF-Transform-based canonicalization pipeline**. Geometric assertions pass for all 47. Materials/textures are preserved bit-faithfully. The pipeline reveals **10 / 47 = 21.3% semantic-role pollution in the frozen Production Selection** that the previous Catalog Gate (PR #21) could not detect because it validated only metadata hashes, not visual content.

The 10 mismatches are:
- **6 / 7 frozen `tv` IDs are not TVs**: `electronics_032` is a desktop computer setup, `electronics_036` is a combination padlock, `electronics_037` is a sewing machine, `electronics_040` is a table lamp, `electronics_046` is a kitchen faucet, `electronics_049` is a kitchen utensil. Only `electronics` is a real TV panel.
- **2 / 8 frozen `sofa` IDs are benches**: `sofa_028` and `sofa_031` lack backrests.
- **1 / 2 frozen `armchair` is an ottoman**: `chair_001`.
- **1 / 3 frozen `floorLamp` is a table lamp**: `lamp_027`.

Total: **10 / 47 = 21.3% semantic-role mismatches**. The frozen Production Selection owns `semanticRole`; K1 does NOT modify it. K1 records observed identity separately in the evidence ledger with `semanticMismatch = true` and `productionEligibility = blocked` for downstream resolution.

---

## 1. Start state and base

| Field | Value |
|---|---|
| Repository | `InteriorMagic` |
| Expected base | `e156c8f727f04ae38d358c489fdc9c68e6618eb7` (merge of PR #21) |
| K1_BASE_SHA verified ancestor of HEAD | YES (no advance) |
| Branch | `feature/k1-production-asset-spatial-truth` (pinned to K1_BASE_SHA at creation) |
| Frozen selection | `src/editor/catalog/data/production-catalog-v1.json` (47 assets) |
| Frozen canonical accessor | `src/editor/catalog/productionSelection.ts` |
| Untouched during K1 | `src/editor/assets/registry.ts`, `src/app/local/ithappyRegistryPrototype.ts`, `src/editor/planning/**`, `src/editor/placement/**`, `src/editor/model/types.ts`, `workers/**`, `src/scene/**` |

---

## 2. Source provenance correction (2026-08-26)

The authoritative raw asset directory was redefined mid-track:

| Field | Value |
|---|---|
| Authoritative raw asset directory | `D:\Programms\Max\Assets\Realistic_Furniture_glb\Furniture_Realistic_glb` (READ-ONLY) |
| Monolithic alternative (NOT used) | `D:\Programms\Max\Assets\Realistic_Furniture_glb\Furniture_Realistic.glb` (207 MB, all 836 assets) |
| Previous (deprecated) root | `D:/Programms/Max/InteriorMagic/.agent-data/ithappy-production-pipeline/runtime-assets` |
| Env var preferred | `K1_SOURCE_ASSET_ROOT` |
| Env var legacy alias | `ITHAPPY_PIPELINE_ROOT` (still works for backwards compatibility) |
| Fallback default | `D:/Programms/Max/Assets/Realistic_Furniture_glb/Furniture_Realistic_glb` |
| Frozen selection resolution | 47 / 47 selected IDs present, 1 GLB each |
| Hash match (previous root → new root) | 47 / 47 identical SHA256 (no RAW evidence regeneration required) |
| K1 writes to source directory | NEVER — all K1 outputs go under `<worktree>/.agent-data/k1-production-assets/` (gitignored) |
| Forensic record | `.agent-data/k1-production-assets/reports/k1-source-provenance.json` |
| ADR amendment | `docs/adr/production-asset-coordinate-contract-k1.md` § 11 |

---

## 3. Canonical coordinate contract

**Units:** meters. **Up axis:** +Y. **Canonical semantic forward:** +Z.

Forward convention is **project-wide editor invariant**, proven by two co-located lines of code:
- `src/editor/spatial/geometry.ts:66`: `xzHeading = atan2(to.x - from.x, to.z - from.z)` — heading depends on the Z component.
- `src/editor/planning/conversation/planner.ts:27`: `backward = (-sin θ, -cos θ)` — at `θ = 0` the planner's backward direction is `-Z`, so the canonical forward is `+Z`.

Forward direction is **NOT** inferred from Box3, source filename, or `sourceCategory`. It is derived from RAW visual evidence only.

**Floor contact:** `abs(min.y) ≤ FLOOR_CONTACT_EPSILON_M` (0.005 m). Origin invariant (floor assets): `abs(midpointX) ≤ ORIGIN_EPSILON_M` AND `abs(midpointZ) ≤ ORIGIN_EPSILON_M`.

**Translation order (guardrail #1):**
1. Apply rotation correction to root scene node (Y-axis quaternion).
2. (gltf-transform applies world transforms lazily.)
3. Re-measure Box3 from POST-ROTATION accessor bounds.
4. Compute midpointX, midpointZ, minY from POST-ROTATION Box3.
5. Apply translation = `(-midpointX, -minY, -midpointZ)`.
6. Floor contact symmetric `abs(minY)` check.

NEVER translate to `Box3.min → (0,0,0)`.

---

## 4. Architectural boundaries

| Layer | Owns | Does NOT own |
|---|---|---|
| Production Selection (frozen) | `assetId`, `semanticRole` | spatial facts, runtime revision |
| Production Asset Facts (committed) | `assetId`, `dimensions`, `footprint`, `placement`, `canonicalForward` | hashes, transforms, QA verdicts, semanticRole |
| Production Asset Spatial Evidence Ledger (committed) | `sourceSha256`, `canonicalSha256`, transforms, RAW QA, canonical QA, `semanticMismatch`, `productionEligibility` | (this IS the evidence) |
| K1 local-only evidence workspace | source GLBs, canonical GLBs, PNGs, RAW/CANONICAL QA reports | (these ARE the binaries) |

`productionEligibility` in the evidence ledger is `"eligible"` (semantic match) or `"blocked"` (semantic mismatch). The frozen Production Selection is NEVER modified by K1.

**Asset ID compatibility invariant (RoomProject stability):** A new runtime revision under the same `assetId` may change compression, texture encoding, mesh optimization, material implementation, packaging, delivery representation — but MUST NOT silently change the asset's domain/spatial identity (`semanticRole`, placement anchor, canonical forward, origin semantics, dimensions beyond tolerance, footprint semantics). If spatial meaning changes materially, allocate a new asset identity OR require an explicit RoomProject migration decision.

---

## 5. RAW Visual QA 47 / 47

Frozen as evidence layer. Output: `.agent-data/k1-production-assets/reports/k1-visual-qa-raw.json`.

| Status | Count |
|---|---|
| **pass** | 37 |
| **fail** | 10 (identity/placement mismatch with frozen role) |
| **unsupported** | 0 |
| Total | **47** (exactly matches frozen selection) |

### 5.1 Identity mismatches (the 10 FAIL)

| AssetId | Frozen role | Observed identity | Notes |
|---|---|---|---|
| `chair_001` | armchair | round tufted ottoman / pouf | no backrest |
| `lamp_027` | floorLamp | table lamp | cream shade + dark ceramic base, table-top scale |
| `electronics_032` | tv | desktop computer setup | curved monitor on stand + keyboard + mouse |
| `electronics_036` | tv | combination padlock / keypad security device | wrong category entirely |
| `electronics_037` | tv | sewing machine / cylindrical appliance | wrong category entirely |
| `electronics_040` | tv | table lamp | second lamp misclassification |
| `electronics_046` | tv | kitchen faucet / sink tap | wrong category entirely |
| `electronics_049` | tv | kitchen utensil / sink sprayer | wrong category entirely |
| `sofa_028` | sofa | bench | flat slab, no backrest, no cushions |
| `sofa_031` | sofa | bench | flat dark slab, no backrest |

### 5.2 Forward direction findings

- **8 sofas (the 6 confirmed-sofas + 2 FAIL-bench variants)**: source backrest at +Z → canonical forward = -Z → rotation π required for canonical +Z. (The 2 FAIL benches got rotation 0 because they have no forward.)
- **`electronics` (real TV)**: source screen faces +Z → rotation 0.
- **Floor lamps `lamp`, `lamp_028`**: radially symmetric, no inherent forward.
- **Rugs, tables, dressers, cupboards, plants, kitchen objects, the 6 fake-TVs**: forward = ambiguous.

---

## 6. Batch canonicalization 47 / 47

K1 uses **glTF-Transform's NodeIO** as the canonical writer (replaced the failed GLTFExporter approach which stripped materials/textures in Node ESM). glTF-Transform preserves textures/materials bit-faithfully on round-trip.

Output: `.agent-data/k1-production-assets/reports/k1-canonicalization-report.json`.

| Metric | Value |
|---|---|
| Canonicalized | 47 / 47 |
| Skipped | 0 |
| Rotation distribution | 41 × rotation 0 + 6 × rotation π (the 6 PASS sofas) |
| `orientationDerived: true` count | 8 (chair + electronics + 6 sofas) |
| `semanticMismatch: true` count | 10 |
| Measurement failures (midpointX/Z, floorContact, dimensionsPreserved) | **0** |

**Two-asset pilot gate (per user rule §4):**
- Pilot A (sofa, rotation π): **PASS** on all 5 dimensions — identity, materials, contact, orientation, geometry. Verified via deterministic renderer camera-basis check (renderer `view "+Z"` = `camera.position.z > 0`, `view "-Z"` = `camera.position.z < 0`, both `lookAt(assetCenter)`, `camera.up` defaults to `+Y`). Canonical sofa +Z shows the FRONT (cushions + armrests + tufted backrest); canonical sofa -Z shows the REAR (smooth backrest silhouette).
- Pilot B (carpet, rotation 0, ambiguous forward): **PASS** on all 4 dimensions — identity, materials, contact, geometry. `orientationCanonical = notApplicable` (rugs have no inherent forward).

---

## 7. Canonical visual QA 47 / 47

Output: `.agent-data/k1-production-assets/reports/k1-visual-qa-canonical.json`.

| Metric | Value |
|---|---|
| pass | 47 |
| fail | 0 |
| orientation `pass` | 8 (chair + electronics + 6 sofas) |
| orientation `notApplicable` | 39 (rugs, plants, tables, dressers, cupboards, lamps, the 6 fake-TVs) |
| orientation `fail` | 0 |
| `semanticMismatchPreserved = true` | 10 (canonical derivative STILL shows the observed identity, not magically transformed into the frozen role) |

Spot-check confirmed visually: canonical `electronics_032` top-down clearly shows curved monitor + keyboard + mouse (desktop computer setup), NOT a TV.

**`semanticMismatch = true` + `canonicalQa = pass` is the canonical, expected outcome** for the 10 mismatch assets — geometry is preserved, observed identity is preserved, only the role-derived "should look like an armchair/TV/floorLamp" inference is absent.

---

## 8. Committed artifacts

### 8.1 `src/editor/catalog/data/production-asset-facts-v1.json`

DURABLE SPATIAL FACTS ONLY. Schema: `assetId`, `dimensions`, `footprint`, `placement`, `canonicalForward`.

Verified forbidden-field scan: 0 hits for `assetRevisionId`, `modelUrl`, `signedUrl`, `r2Key`, `sourceCategory`, `realWorldScale`, `plannerEligible`, `arEnabled`, `semanticRole`.

Membership: exactly 47 assetIds, no duplicates, exact match with frozen selection.

`evidenceLedgerSha256`: `d32bc368417c4c94bd5be7d57104f1c15a76cb8d54594697f1dd088d7edcf7f7`

### 8.2 `src/editor/catalog/data/production-asset-spatial-evidence-v1.json`

NON-BINARY EVIDENCE. Per entry: `assetId`, `sourceSha256`, `canonicalSha256`, `sourceApparentForwardAxis`, `appliedTransform`, `measurementAssertions`, `rawVisualQa`, `canonicalVisualQa`, `semanticMismatch`, `productionEligibility`, `notes`.

Membership: exactly 47 entries, no duplicates, exact match with frozen selection.

`productionEligibility`:
- `eligible` = 37 (the 37 RAW-pass assets)
- `blocked` = 10 (the 10 FAIL assets with semantic mismatch)

---

## 9. Hard gate pre-Commit 2 / pre-Commit 3

| Gate | Result |
|---|---|
| Selection IDs == Facts IDs == Evidence IDs == Canonical GLB IDs | ✓ exactly 47, all equal sets |
| No duplicates in any artifact | ✓ |
| `semanticMismatch` count == 10 | ✓ |
| RAW fail count == 10 | ✓ |
| Canonical QA fail count == 0 | ✓ |
| `npm run test:catalog` (68 hermetic tests) | ✓ 68 / 68 pass |
| `npm test` (362 vitest tests across 49 files) | ✓ 362 / 362 pass |
| `npm run typecheck` | ✓ 0 TS errors |
| `npm run build` | ✓ built in 9.76s |
| `git diff --check` | ✓ clean (only CRLF warnings from pre-existing line endings) |
| `npm run lint` | 124 pre-existing errors at K1_BASE_SHA (NOT introduced by K1; frozen lint state at post-PR#21) |

Forbidden-field grep on Commit 2 + 3 candidate files: 0 hits.

---

## 10. Local binary evidence produced

K1 writes ONLY to `<worktree>/.agent-data/k1-production-assets/` (gitignored). The authoritative source directory is READ-ONLY and was never modified.

| Artifact | Count | Path |
|---|---|---|
| Canonical GLBs | 47 | `.agent-data/k1-production-assets/canonical/<id>.glb` |
| Canonical renders | 235 (47 × 5 views) | `.agent-data/k1-production-assets/visual/canonical/*.png` |
| RAW renders | 235 (47 × 5 views) | `.agent-data/k1-production-assets/visual/raw/*.png` |
| RAW visual QA report | 1 | `.agent-data/k1-production-assets/reports/k1-visual-qa-raw.json` |
| Canonical visual QA report | 1 | `.agent-data/k1-production-assets/reports/k1-visual-qa-canonical.json` |
| Canonicalization report | 1 | `.agent-data/k1-production-assets/reports/k1-canonicalization-report.json` |
| RAW audit (Box3 of source vertices) | 1 | `.agent-data/k1-production-assets/reports/k1-audit-raw.json` |
| Source provenance | 1 | `.agent-data/k1-production-assets/reports/k1-source-provenance.json` |
| Failed-canonicalization archive | 46 GLBs + 235 PNGs + 3 reports | `.agent-data/k1-production-assets/failed-canonicalization/gltfexporter-material-loss/` |

---

## 11. Failed-canonicalization archive (forensic note)

The previous canonicalization attempt using `GLTFExporter` in Node ESM silently dropped all textures/materials (uniform gray derivatives). After canonical QA detected this universal regression, the failed artifacts were preserved under `.agent-data/k1-production-assets/failed-canonicalization/gltfexporter-material-loss/`.

**Discrepancy note:** The archive contains **46 GLBs** rather than the expected 47 (the missing `sofa.glb` was overwritten by a later pilot re-run on `sofa` before archival moved it; the canonicalization report at the time still recorded all 47 rows but only 46 GLB files persisted to disk). The audit (`.agent-data/k1-production-assets/reports/k1-audit-raw.json`) and RAW QA (`.agent-data/k1-production-assets/reports/k1-visual-qa-raw.json`) remain valid for all 47 assets — the audit does not depend on the failed canonical GLBs.

The new glTF-Transform-based canonicalization regenerated all 47 GLBs from scratch into `.agent-data/k1-production-assets/canonical/`, with full 47 / 47 count and zero measurement regressions.

---

## 12. Pending downstream requirements (for K2/K3 release tooling)

1. **Resolve the 10 semantic mismatches** in the frozen Production Selection. K1 does NOT modify the frozen selection. The release tooling (K2/K3) must either:
   - Re-curate the frozen selection to match observed identity (replace `electronics_032/036/037/040/046/049` tv-rows with their actual semantic role), OR
   - Allocate new `assetId`s for the correctly-categorized objects and migrate RoomProject storage, OR
   - Add explicit `frozen role ≠ observed identity` escape hatch to the placement engine.
2. **Reconcile `Category` enum** with `FurnitureSemanticRole` — current `Category` lacks `tv`; either extend the union or document the gap.
3. **Mint `assetRevisionId`s** at actual production release. K2 binds `assetRevisionId → assetId + sourceSha256 + canonicalSha256 + spatialFactsEntrySha256 + canonicalizationReportSha256`.
4. **Implement AssetResolver + `/assets/resolve` + asset-gateway + HMAC grants + signed URLs + R2 private delivery** — all deferred (not K1 scope).

---

## 13. Commits delivered

| Commit | Title | Status |
|---|---|---|
| `73c644b` | K1: freeze canonical asset coordinate contract | ✓ verified clean |
| Commit 2 | K1: audit and establish production spatial facts | ready (pending commit) |
| Commit 3 | K1: add spatial evidence gates and report | ready (pending commit) |

---

## 14. Rights status

**CLARIFICATION REQUIRED.** K1 does not resolve delivery rights. No licensed GLB/USDZ bytes are uploaded to R2. No signed URLs are created. No AssetResolver is implemented. No production delivery is enabled. All K1 binary artifacts remain local under `<worktree>/.agent-data/k1-production-assets/` (gitignored).

---

## 15. Verification of untouched invariant

| Frozen file | Modified? |
|---|---|
| `src/editor/catalog/data/production-catalog-v1.json` | NO |
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
| RoomProject persistence | UNTOUCHED |
| AssetResolver / `/assets/resolve` | NOT IMPLEMENTED |
| Asset gateway | NOT IMPLEMENTED |
| Planner | UNTOUCHED |

---

## 16. Final verdict

**B — K1 SPATIAL TRUTH ESTABLISHED / 10 FROZEN SELECTION ASSETS HAVE SEMANTIC MISMATCHES.**

K1 succeeded at its forensic + contract goal. It produced:
- A texture-preserving glTF-Transform-based canonicalization pipeline.
- 47 canonical GLBs with 0 measurement failures and bit-faithful material preservation.
- 47 / 47 canonical visual QA pass with proper handling of `semanticMismatch = true + canonicalQa = pass`.
- Two non-binary committed artifacts (facts + evidence ledger) with strict field separation.

K1 also discovered a real structural problem in the frozen Production Selection (~21.3% semantic-role pollution) that the Catalog Gate (PR #21) could not detect because it validated only metadata hashes. This is not a K1 failure; it is K1's primary deliverable: spatial truth independent of role metadata.

K2/K3 release tooling must address the 10 semantic mismatches before production activation. K1 ends before delivery / runtime activation per its scope.

**STOP. Do not merge. Do not start K2/K3.**
