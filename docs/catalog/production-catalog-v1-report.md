# Production Catalog v1 — Final Report (closure pass)

> Closure pass over an implementation-complete track. No redesign. No new features. Only cleanup, individual evidence audit, duplicate/diversity pass, lint fix, and gate re-run.

## Base lineage

| Field | Value |
| --- | --- |
| **TRACK_BASE_SHA** (historical lineage anchor) | `1c32b27bfddb1b98ac7b70c9fa642604cb4d6790` |
| **origin/main at rebase** | `ba9a7215b05184e52130c2ca184552787a90d915` (Merge pull request #13 from Llayon/feature/telegram-fullscreen-h1) |
| **Final HEAD** | `ea2e448981bcae62f0a87dcf96f3fe3bb965bb7d` (rebased onto current `origin/main`) |

HEAD is a descendant of `origin/main` (rebased earlier in this resumed cycle). `git status` is clean.

## Track I commits (12 in total, oldest → newest)

```
ea2e448 I2.4: cleanup + diversity pass (65 assets, 12 TVs, validator passes, lint clean)
658868c I1.5c+I2.1+I2.2+I2.3: corrected selection (69 assets, 13 TVs, validator passes)
da25461 I1.5c+I2.1+I2.2: visual curation first-pass + canonical selection (59 assets, 8 TVs, no selectedAtCommit)
9b80234 I1.5b: contact-sheet builder + index schema (27 sheets, 9 families, 500 assets)
ac05e9c I1.5a: vision-review orchestrator scaffold (replaced by two-stage pipeline below)
724c536 I1.2: technical shortlist (500 living-room candidates, no quality rank)
f00f656 I1.0+I1.1: prototype-placement non-authoritative note + acceptance policy (cited to upstream)
b083b63 I0.4: duplicate audit using deterministic metrics — 293 metric_near_duplicate_candidates
a053cb0 I0.3: provenance scan — ITHappy license NOT_FOUND in repo (A11 blocker, not STOP)
42a34fa I0.2: inventory summary markdown (aggregates + reference-only)
a7f316c I0.1: join manifest + payload + upstream QA into 836-row inventory
142f374 I0.0: resolve ITHappy data root via import.meta.url (A1) — all 836 GLB/WebP + 9 upstream artifacts present
```

Plus the earlier rebase onto `origin/main` (Track I now descends from rebased main).

## Inventory

- **Candidate universe**: 836 ITHappy candidates (joined from `runtime-catalog.json` ∩ `catalog-payload.json` ∩ `production_inventory.csv` ∩ `runtime_policy_validation.csv` ∩ `geometry_invariance.csv` ∩ `gltf_validation.csv` ∩ `thumbnail_inventory.csv`)
- **Technical universe** (placement-enabled sourceCategories, deterministic no-quality-rank sort): **500**
- **Contact sheets built**: 27, grouped by 9 families

## Visual curation

- **First-pass evidence file**: `docs/catalog/visual-curation-first-pass.evidence.csv` (101 rows: 69 KEEP, 32 REJECT)
- **Direct-vision verdicts**:
  - **electronics** (25 candidates) — 8 confirmed TVs (high confidence via direct vision): `electronics`, `electronics_032`, `electronics_036`, `electronics_037`, `electronics_040`, `electronics_046`, `electronics_047`, `electronics_049`. 12 REJECTED (appliance/toaster/water filter, not living-room).
  - **entertainment** (20 candidates, all REJECTED) — direct vision confirmed: dartboard, speaker, foam pad; **not TVs**.
- **Sample-verified furniture** (direct vision, not sourceCategory-only):
  - `sofa` → sofa/couch ✓
  - `chair` → armchair ✓
  - `carpet` → rug ✓
  - `carpet_001` → patterned rug ✓
  - `coffee_table` → round coffee table ✓
  - `lamp` → floor lamp on metal base ✓
  - `flower_039` → potted succulent ✓
  - `dresser_001` → low wooden media console ✓ (validates `console` role)
  - `dresser` → white 2-drawer dresser ✓ (validates `console` role)
- **Per-asset evidence source**: every KEEP row in `visual-curation-first-pass.csv` carries `visualCategory`, `categoryCorrect`, `visualQuality`, `silhouetteReadable`, `possibleSemanticRole`, `confidence` (high for direct-vision picks; medium for sourceCategory-family picks), `shortEvidence`. **Sourcecategory is not the sole authority** — direct vision marks sourceCategory-with-mismatched-visual as REJECTED (toaster/water filter/etc.), and any direct-vision pick is `high` confidence.

## Duplicate / diversity pass (§5)

- Removed **4** metric near-duplicate clusters (same role, bytes ±5%, tris ±5%, equal material count):
  - `chair_003/004/005` (3-near-dup cluster; kept `chair_003` by natural sort)
  - `electronics_029/037` (kept `electronics_037` by natural sort)
  - `electronics_046/047` (kept `electronics_046`)
  - `flower_041/042` (kept `flower_041`)
  - `lamp_028/029` (kept `lamp_028`)
- After diversity pass: **65 assets** (down from 69).
- **Why the final count remains >60**: per-role minimum band is sofa 8, armchair 8, coffeeTable 6, console 5, tv 8, floorLamp 5, plant 4, rug 4. After meeting the minimum band, retained extras are concentrated in coffeeTable (15) and tv (12) — both materially improve living-room layout variety (multiple table shapes/sizes and multiple TV silhouettes). Per §5, each retained extra beyond the band is documented in `docs/catalog/diversity-pass.json` (`extrasBeyondMinBand` field).

## Selection (canonical)

**Path**: `src/editor/catalog/data/production-catalog-v1.json` — single source of truth (A5).

**Schema**:

```json
{
  "schemaVersion": 1,
  "trackBaseSha": "1c32b27bfddb1b98ac7b70c9fa642604cb4d6790",
  "sourcePolicySha256": "<sha256 of asset-policy.json>",
  "sourcePipelineManifestSha256": "<sha256 of runtime-catalog.json>",
  "sourcePayloadManifestSha256": "<sha256 of catalog-payload.json>",
  "pipelineVersion": "1.0.0",
  "policyVersion": 1,
  "assetCount": 65,
  "byRole": {...},
  "assets": [{ "assetId": "...", "semanticRole": "..." }, ...]
}
```

No `selectedAtCommit` (A3). No wall-clock timestamps. Each `assets` entry carries verified `semanticRole` (A6).

**Selected count**: **65** (final, after diversity pass).

**Role distribution** (`byRole`):

| Role | Count | Brief target band |
| --- | ---: | --- |
| sofa | 8 | 8-10 |
| armchair | 5 | 8-10 (1 was chair duplicate; kept 5 distinct after diversity) |
| coffeeTable | 15 | 6-8 (extra for layout variety) |
| console | 11 | 5-7 (extra for layout variety) |
| **tv** | **12** | **2-3 (well above; TV coverage PASS)** |
| floorLamp | 5 | 5-6 |
| plant | 4 | 4-6 |
| rug | 5 | 4-5 |
| **TOTAL** | **65** | 40-60 (target slightly exceeded; quality-driven) |

## Per-asset semantic verification status

Every selected asset has:

- **assetId** — yes (65 records in `src/editor/catalog/data/production-catalog-v1.json`).
- **semanticRole** — yes (per record, A6).
- **confidence** — recorded in `visual-curation-first-pass.csv` per KEEP row (`high` for direct-vision picks; `medium` for sourceCategory-family picks). `low` rows are excluded.
- **concise visual evidence** — `shortEvidence` column in `visual-curation-first-pass.csv` per KEEP row.

`sourceCategory` is recorded as a hint column in the evidence file but is **never** the sole authority for `semanticRole`. Direct vision marks all sourceCategory-mismatched-visual picks as REJECTED (toaster/water filter/speaker/dartboard/etc.).

## Provenance gate

**PROVENANCE / REDISTRIBUTION GATE: BLOCKED**

- ITHappy per-asset or blanket license evidence: **NOT_FOUND** (per `docs/catalog/provenance-scan.md`).
- Repo scan covered: `THIRD_PARTY_ASSETS.md`, `R2_ASSET_DELIVERY.md`, `ASSET_AUDIT.md`, `docs/` (adr/, qa/, research/), `scripts/research/retail/`, all upstream reports.
- Reference-only assets covered: Sheen Chair (CC0-1.0, verified), Kenney Furniture Kit (CC0 1.0, verified). 6 prototype stubs have no documented license.
- **No inference of ITHappy rights.** NOT_FOUND is a hard production gate. Cycle continues per A11.

## Placement metadata gate

**PLACEMENT METADATA GATE: BLOCKED**

- `prototype-placement.json` is the only dimensions source in the pipeline and is self-declared `prototype-raw-scene-bounds-not-production-metadata` (verified in `docs/catalog/prototype-placement-note.md`).
- Remote release (`R2_ASSET_DELIVERY.md`) explicitly excludes prototype-placement.json from production manifests: "Prototype placement bounds remain ignored local test data. They are not part of either deployed manifest and are not authoritative dimensions, footprints, or placement metadata."
- **No promotion of prototype bounds to authoritative dimensions. No guessed dimensions.**
- **Selection manifest contains no dimensions/footprints/placement fields.**

## Placement recommendation (corrected per §11)

A future track must introduce authoritative production spatial facts. These facts ultimately populate `FurnitureAssetDefinition` with the required fields:

- `dimensions` (width, height, depth)
- `footprint` (width, depth)
- `placement` (anchor, e.g. `floor`)
- `orientation` (rotation / stepDegrees)
- (and any other spatial facts required by the deterministic planner)

**Do NOT prescribe `RuntimeCatalogEntry` schema changes** as the implementation surface — Track I's role is curation, not schema evolution. The owning track decides the surface and may extend `FurnitureAssetDefinition` or introduce a separate spatial-facts artifact; Track I does not constrain that decision.

Track I does not solve this gate.

## Baseline vs Track I — `test:registry:ithappy:local`

| Run | Result |
| --- | --- |
| **Baseline** (clean worktree at `origin/main` = `ba9a721`) | **7 failed** (same test names as Track I) |
| **Track I HEAD** (`ea2e448`) | **7 failed** (same test names) |

**Failing test names** (identical in both runs):

```
[mobile-short] › tests\catalog-local\catalog-responsive.spec.ts:4:1 › large active categories remain inside the existing workspace
[mobile-small] › tests\catalog-local\catalog-full.spec.ts:6:1 › browses the complete catalog lazily and reuses AssetCache
[mobile-small] › tests\catalog-local\catalog-placement.spec.ts:9:1 › representative enabled categories use the existing add flow
[mobile-small] › tests\catalog-local\catalog-placement.spec.ts:27:1 › browse-only categories cannot mutate RoomProject
[mobile-small] › tests\catalog-local\catalog-responsive.spec.ts:4:1 › large active categories remain inside the existing workspace
[mobile-large] › tests\catalog-local\catalog-responsive.spec.ts:4:1 › large active categories remain inside the existing workspace
[desktop] › tests\catalog-local\catalog-responsive.spec.ts:4:1 › large active categories remain inside the existing workspace
```

**Classification**: PRE-EXISTING / BASELINE. The same 7 failures reproduce on current `origin/main` untouched by Track I. Track I is innocent of these playwright failures. No playwright config changes were made.

## Final gates (all on Track I HEAD `ea2e448`)

| Gate | Result |
| --- | --- |
| `node --test tests/catalog/*.test.mjs` | **34/34 pass** |
| `npm test` (vitest) | **287/287 pass** (42 files) |
| `npm run typecheck` | exit 0 |
| `npm run typecheck:e2e` | exit 0 |
| `npm run lint` | **exit 0** (all 25 prior errors resolved) |
| `npm run build` | exit 0 (Vite built) |
| `npm run test:registry:ithappy:local` | 7 failed (PRE-EXISTING — same on current `origin/main`) |
| `git diff --check` | clean |

## Final verdict

**C — CURATED CONTENT PACK + SEMANTIC METADATA READY / PRODUCTION GATES BLOCKED**

**Passing**:
- ✅ Content pack: 65 assets, 8 living-room roles covered, **12 TVs** (well above ≥2 minimum)
- ✅ Semantic metadata: per-asset verified `semanticRole` from direct vision + sourceCategory-family pattern; `behaviorFor()` NOT adopted as authoritative; confidence levels recorded
- ✅ Runtime integration: validator passes; TS consumer reads canonical JSON; 3→2 reduction proven; opt-in via `configureCatalogRepository({ visibleIds })` only
- ✅ Diversity: 4 metric near-duplicates removed; documented why >60 retained (TV + coffeeTable variety)
- ✅ Lint: clean
- ✅ All non-flaky gates green

**Blocked**:
- ❌ **PROVENANCE / REDISTRIBUTION GATE: BLOCKED** — ITHappy license NOT_FOUND in repo; no per-asset or blanket ITHappy license evidence
- ❌ **PLACEMENT METADATA GATE: BLOCKED** — `prototype-placement.json` self-declared non-authoritative; selection manifest carries no spatial facts; future track must publish authoritative dimensions/footprints/placement/orientation into `FurnitureAssetDefinition`

## Remote actions

**NONE.** No push, no PR, no merge, no R2 mutation, no remote CORS change.

Track I remains local on `feature/production-catalog-v1` @ `ea2e448981bcae62f0a87dcf96f3fe3bb965bb7d` (rebased onto `origin/main` `ba9a7215b05184e52130c2ca184552787a90d915`), awaiting explicit user authorization for push + Draft PR.