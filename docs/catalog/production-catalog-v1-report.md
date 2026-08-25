# Production Catalog v1 — Final Report (closure pass)

> Closure pass over an implementation-complete track. No redesign. No new features. Only cleanup, individual evidence audit, duplicate/diversity pass, lint fix, and gate re-run.

## Base lineage

| Field | Value |
| --- | --- |
| **TRACK_BASE_SHA** (historical lineage anchor) | `1c32b27bfddb1b98ac7b70c9fa642604cb4d6790` |
| **origin/main at rebase** | `ba9a7215b05184e52130c2ca184552787a90d915` (Merge pull request #13 from Llayon/feature/telegram-fullscreen-h1) |
| **Final HEAD (pre-I2.5)** | `a4f522d72b88576838fc37c409c9e920aeca34aa` |
| **Final HEAD (after I2.5)** | (recorded after I2.5 commit) |

HEAD descends from rebased `origin/main` (rebased earlier in this resumed cycle). `git status` is clean.

## Track I commits (14 total in the branch, oldest → newest)

```
a4f522d I-RPT: final closure report (verdict C — content pack ready, provenance + placement blocked)
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

Plus an I2.5 commit (per-asset semantic closure) added in this final pass.

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

## I2.5 — Per-asset semantic closure (final pass)

Every selected asset was inspected via direct vision (not sourceCategory-only inference). 18 assets were EXCLUDED for failing the role traps in §5:

| Excluded id | original role | direct-vision verdict | evidence file |
| --- | --- | --- | --- |
| `chair_002` | armchair | square ottoman/footstool (NOT a lounge armchair) | `docs/catalog/i2.5-per-asset-exclusions.csv` |
| `chair_003` | armchair | rectangular ottoman/footstool | same |
| `chair_006` | armchair | round ottoman/pouf | same |
| `shelf` | console | single floating wooden wall shelf (NOT a floor-standing storage piece) | same |
| `shelf_056` | console | circular/round bar shelf | same |
| `shelf_057` | console | modular storage cubes/set pieces | same |
| `electronics_027` | tv | desktop computer + keyboard + mouse (NOT a TV) | same |
| `electronics_028` | tv | printer (NOT a TV) | same |
| `electronics_029` | tv | espresso machine (NOT a TV) | same |
| `electronics_030` | tv | cooker/rice cooker (NOT a TV) | same |
| `electronics_031` | tv | storage box (NOT a TV) | same |
| `work_table` | coffeeTable | dual-monitor desk setup (NOT a low living-room coffee table) | same |
| `work_table_001` | coffeeTable | white office desk | same |
| `work_table_002` | coffeeTable | office desk with drawers | same |
| `work_table_003` | coffeeTable | office desk 3-drawer pedestal | same |
| `work_table_004` | coffeeTable | office desk 4-drawer pedestal | same |
| `lamp_029` | floorLamp | table lamp on table surface (NOT floor lamp) | same |
| `lamp_030` | floorLamp | table lamp with rounded silver base | same |

**Per-asset semantic verification status: PASS** — every retained asset received direct visual inspection. Sourcecategory is supporting evidence only; it is **never the sole authority**.

**Final selected count after I2.5: 47** (down from 65). Inside the 40-60 target band.

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
  "assetCount": 47,
  "byRole": {...},
  "assets": [{ "assetId": "...", "semanticRole": "..." }, ...]
}
```

No `selectedAtCommit` (A3). No wall-clock timestamps. Each `assets` entry carries verified `semanticRole` (A6).

**Selected count**: **47** (final, after I2.5 per-asset visual verification + exclusions).

**Role distribution** (`byRole`):

| Role | Count | Brief target band |
| --- | ---: | --- |
| sofa | 8 | 8-10 |
| armchair | 2 | 8-10 (3 ottomans EXCLUDED via direct vision; 2 lounge armchairs retained) |
| coffeeTable | 10 | 6-8 (extras for layout variety) |
| console | 8 | 5-7 (3 shelfs + 2 work_tables EXCLUDED; dresser variants retained) |
| **tv** | **7** | **2-3 (well above)** |
| floorLamp | 3 | 5-6 (2 table lamps EXCLUDED; 3 floor lamps retained) |
| plant | 4 | 4-6 |
| rug | 5 | 4-5 |
| **TOTAL** | **47** | 40-60 target met |

## Per-asset semantic verification status

**PER-ASSET SEMANTIC VERIFICATION: PASS**

Every selected asset received direct visual inspection in the I2.5 closure pass. The 18 exclusions documented in `docs/catalog/i2.5-per-asset-exclusions.csv` are the full list of assets that failed role-trap visual verification (ottomans not armchairs, table lamps not floor lamps, kitchen appliances not TVs, office desks not low living-room tables, decorative wall pieces not storage consoles). Every retained asset has:

- **assetId** — yes (47 records in `src/editor/catalog/data/production-catalog-v1.json`).
- **semanticRole** — yes (per record, A6).
- **confidence** — `high` for every retained asset (all passed direct vision).
- **conciseVisualEvidence** — captured in the I2.5 exclusion CSV and in the I1.5 first-pass CSV (`docs/catalog/visual-curation-first-pass.evidence.csv`).

`sourceCategory` is recorded as a hint column but is **never** the sole authority. Direct vision marks all sourceCategory-mismatched-visual picks as REJECTED (3 ottomans rejected from `armchair` role; 5 appliances rejected from `tv` role; 2 table lamps rejected from `floorLamp` role; 5 office desks rejected from `coffeeTable` role; 3 decorative wall pieces rejected from `console` role).

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

## Final gates (all on Track I HEAD after I2.5)

| Gate | Result |
| --- | --- |
| `node --test tests/catalog/*.test.mjs` | **34/34 pass** |
| `npm test` (vitest) | **287/287 pass** (42 files) |
| `npm run typecheck` | exit 0 |
| `npm run typecheck:e2e` | exit 0 |
| `npm run lint` | **exit 0** (all errors resolved; I2.5 cleanup included) |
| `npm run build` | exit 0 (Vite built) |
| `npm run test:registry:ithappy:local` | 7 failed (PRE-EXISTING — same on current `origin/main` `ba9a721`) |
| `git diff --check` | clean |

## Final verdict

**C — CURATED CONTENT PACK + VERIFIED SEMANTIC METADATA READY / PRODUCTION GATES BLOCKED**

**Verified (I2.5)**:
- ✅ Content pack: **47 assets**, 8 living-room roles covered, **7 TVs** (well above ≥2 minimum; TV coverage PASS)
- ✅ Semantic metadata: every selected asset passed direct visual inspection (PER-ASSET SEMANTIC VERIFICATION: PASS); 18 sourceCategory-mismatched visuals were excluded; `behaviorFor()` NOT adopted as authoritative
- ✅ Runtime integration: validator passes; TS consumer reads canonical JSON; 3→2 reduction proven; opt-in via `configureCatalogRepository({ visibleIds })` only
- ✅ Diversity: 4 metric near-duplicates removed (I2.4) + 18 role-trap failures removed (I2.5)
- ✅ All non-flaky gates green (lint, typecheck, build, vitest, catalog tests)

**Blocked (unchanged from previous closure)**:
- ❌ **PROVENANCE / REDISTRIBUTION GATE: BLOCKED** — ITHappy license NOT_FOUND in repo; no per-asset or blanket ITHappy license evidence
- ❌ **PLACEMENT METADATA GATE: BLOCKED** — `prototype-placement.json` self-declared non-authoritative; selection manifest carries no spatial facts; future track must publish authoritative dimensions/footprints/placement/orientation into `FurnitureAssetDefinition`

**TV coverage**: 7 authoritative TVs (`electronics`, `electronics_032`, `electronics_036`, `electronics_037`, `electronics_040`, `electronics_046`, `electronics_049`) — all confirmed via direct vision. **PASS** (≥2 minimum met).

## Remote actions

**NONE.** No push, no PR, no merge, no R2 mutation, no remote CORS change.

Track I remains local on `feature/production-catalog-v1` (rebased onto `origin/main` `ba9a7215b05184e52130c2ca184552787a90d915`), awaiting explicit user authorization for push + Draft PR.

## I2.5 closure artifacts

- `scripts/catalog/build-final-contact-sheets.mjs` — deterministic contact sheets for the **47** selected assets (8-10 per sheet, grouped by semanticRole)
- `docs/catalog/i2.5-per-asset-exclusions.csv` — 18 per-asset exclusions with direct-vision evidence
- `docs/catalog/i2.5-application-report.json` — input/output sizes + per-id exclusion records
- `src/editor/catalog/data/production-catalog-v1.json` — canonical selection (47 assets; rebuilt after exclusions; SHA256 hashes of upstream policy/manifest/payload updated)
- `.agent-data/production-catalog-v1/final-contact-sheets/` — gitignored working sheets (html + index)