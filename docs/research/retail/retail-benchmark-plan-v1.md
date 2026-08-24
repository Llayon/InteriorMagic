# Retail Benchmark Plan v1

> Track F, Phase F2 — design only. Do not execute yet.
> Date: 2026-08-24. Base: `7a65036`.
> This plan defines *how* a 50-asset manual benchmark would be run if F1 proceeds — it does not run it.

---

## 1. Goal

Validate whether InteriorMagic actual 3D assets have *real purchasable analogues* that are both **visually similar** and **physically compatible** with a room — the product thesis that distinguishes "looks similar" from "can replace the virtual object in this layout".

Two independent gates must be evaluated separately (from brief, binding):

- **Matching GO** — can a visual+dimension matcher find acceptable analogues?
- **DATA GO** — can we obtain and refresh retailer product data via an official path? (answered in `retail-access-feasibility-v1.md` as conditional YELLOW for Yandex Market — this benchmark design must not assume DATA GO is green.)

No data from this plan should show users numerical similarity percentages before calibration.

---

## 2. 50-Asset Sample

### 2.1 Category distribution (per brief)

| Category | Count | InteriorMagic source | Notes |
|---|---|---|---|
| sofas | 10 | `sofa`, `nordicSofa` + 8 from 836-manifest `Seating` | Only sofas, not generic seating |
| armchairs | 10 | `nordicArmchair`, `relaxArmchair`, `chair`, `sheenChair` + 6 from `Seating` | Must include at least 4 true armchairs (wide/deep) vs compact chairs |
| chairs (dining/office) | 10 | 10 from 836-manifest `Seating`/`Tables` | Exclude lounge chairs already counted; focus on dining/office |
| coffee / side tables | 5 | `glassCoffeeTable`, `drawerSideTable` + 3 from `Tables` | Mix glass/wood, low vs side |
| dining tables | 5 | `table` + 4 from `Tables` | Standard dining height (0.72-0.76m) vs counter height |
| storage / TV units | 5 | `lowBookcase` + 4 from 836-manifest `Storage` | Include at least 2 low consoles (TV-unit surrogates) + 2 taller storage |
| lamps | 5 | `lamp`, `roundFloorLamp` + 3 from `Lighting` | Floor lamps only for benchmark (table lamps are out of room-placement scope) |
| **Total** | **50** | | **No decor in v1 commercial benchmark** — large furniture better tests physical-compatibility thesis. |

### 2.2 Selection criteria

- Prefer assets with **complete `dimensions`+`footprint`** in `registry.ts` or manifest (all 17 curated + most 836 have `width/depth/height` in manifest).
- Exclude `rugs`/`plants`/`decor` for this first benchmark (per brief).
- Prefer assets with **existing `thumbnailUrl`** (256x192 WebP) so future multi-view render pipeline can be compared to retail hero images.
- For 836-manifest assets: select by `runtimeBytes` + `triangleCount` near median to avoid overweight Sheen-like outliers; ensure at least one Sheen-weight asset is included as a heavy-case.
- Record per-asset: `assetId`, `sourceCategory`, `displayCategory`, `dimensions`, `footprint`, `thumbnailFilename`, `semantic.role` if present.

### 2.3 What this sample does NOT do

- No mass metadata migration — do not add `materialFamily`/`style` to assets before benchmark.
- No planner invocation — this benchmark measures *analogue quality*, not room-placement outcomes (placement compatibility is measured separately per asset as "dimension-compatible Top-3").

---

## 3. Candidate Collection (manual, per asset)

For each of the 50 assets, a human researcher collects **Top-K (K=10) retail candidates** from available retailers:

1. **Category hard gate first** — only same `Category` candidates are considered (e.g., `sofas` asset vs `sofas` retail category). This is the matcher hard gate that would run before visual similarity.
2. **Dimension normalization/filter** — convert retailer dimensions to meters, filter to tolerance (e.g., +/-25% on width/depth for sofas, tighter for tables — threshold is a benchmark parameter, not a product decision yet). Record whether dimension was available at all.
3. **Multi-view visual similarity (future)** — in F2 this is human judgment; in F3 it would be embeddings. For now, rank by human perception of silhouette/proportions/material/color/style given the asset thumbnail vs retailer hero image(s).
4. **Style/material reranking** — human applies lightweight style/material judgment (velvet vs linen, mid-century vs Scandinavian) as a tie-breaker within dimension-compatible sets.

**Retailer sources for candidates:**

- Primary: **Hoff** (clean furniture taxonomy, expected to have most reliable dimensions) — `hoff.ru/catalog/...`.
- Breadth: **Yandex Market** (aggregator breadth, may surface Hoff/Ozon products via aggregation) — `market.yandex.ru`.
- Prevalence: **Wildberries** (largest order volume, check if analogue is orderable) — `wildberries.ru/catalog/...`.
- Secondary: **Lemana PRO** for `storage / TV units / lamps` categories only — `lemanapro.ru`.
- Ozon is a valid candidate source (large marketplace), but dimensions may be less reliable — rank lower if dimensions are missing.

**Each candidate record must contain:**

- `retailer`, `productId` (stable ID per retail-domain-model), `canonicalUrl`, `title`, `brand?`, `category` (retailer), `dimensions?` (normalized or "missing"), `attributes` (raw specs for later normalization), `price?`, `currency`, `availability` (at collection time), `regionId` (city used for collection, e.g., Moscow), `imageUrl` (hero image URL, not downloaded), `retrievedAt`, `sourceKind=manual-benchmark`.

Store candidate records only in `.agent-data/retail-research/` (uncommitted) during F2 — never commit raw retailer catalog data.

---

## 4. Human Labels

For each asset, label each of its Top-K candidates (or at least Top-3) as:

| Label | Meaning | Customer plausibility |
|---|---|---|
| **A — STRONG SUBSTITUTE** | A real customer could plausibly buy this *instead* of the 3D object. Dimensions within tolerance, silhouette/proportions close, material/color not jarringly different. | Would not return due to "not what I expected". |
| **B — REASONABLE ANALOGUE** | Similar style/proportions but noticeably different (e.g., same category, similar footprint, but velvet vs linen or leg style differs). | Would consider, but preference-sensitive. |
| **C — WEAK** | Mostly category-level similarity (same category, but proportions/style/material are off). | Would not consider as a substitute. |
| **X — INCOMPATIBLE** | Not a valid analogue — wrong category, egregiously wrong dimensions, or missing critical attribute (e.g., sofa vs loveseat, height off by >50%). | Must not be shown as "similar". |

**Labeling rules:**

- Labeler must have both the InteriorMagic asset thumbnail and the retailer hero image(s) side-by-side.
- For dimension errors: if `dimensions` are missing on the retailer side, label as at most `C` (cannot be `A` without confirming physical compatibility).
- Do not show numerical `score` to labeler before calibration.
- A second labeler spot-checks 20% of assets for inter-rater agreement.

---

## 5. Metrics (per brief, computed after labeling)

### 5.1 Matching quality

- **Precision@1** — fraction of assets where Top-1 is `A` (or at least `A/B` — report both).
- **Hit / Recall@3** — fraction where at least one of Top-3 is `A` (and variant where Top-3 contains `A` or `B`).
- **MRR** — mean reciprocal rank of first `A` (1.0 if `A` at rank 1, 0.5 if first `A` at rank 2, etc.).
- **Coverage** — % assets with >=1 acceptable analogue (`A` or `B`) within Top-10 (benchmark-level recall).
- **Dimension-compatible Top-3** — % assets where at least 3 candidates in Top-3 (or Top-5 if Top-3 insufficient) have dimensions within tolerance *and* at least one of them is `A/B`. This is the spatial-compatibility proxy.

### 5.2 Error taxonomy

- **Category-error rate** — % Top-3 candidates that are `X` due to category mismatch.
- **Dimension-error rate** — % Top-3 that are `X` or downgraded to `C` due to missing/egregious dimensions.
- **Visual-error rate** — % Top-3 that are `C` due to style/material/color despite correct category/dimensions.
- **Dead-link rate** — % candidate URLs that are 404 or redirect to unrelated product at verification time.
- **Out-of-stock rate** — % candidates that are `out_of_stock` or `unknown` availability at verification time.
- **Regional-availability rate** — % candidates available in target city vs only in Moscow/SPb (measure with a second `regionId` if feasible).
- **Human verification time / asset** — minutes to collect + label Top-10 for one asset (for F3 cost estimation).

### 5.3 Calibration rule

- Internally `score` is numeric. Do not show percentages to users before calibration.
- Initial UX: `Otlichno podkhodit` / `Pokhozhiy variant` / `Drugoy variant`.
- Only if benchmark shows reliable calibration (e.g., `score >= threshold` reliably maps to `A` acceptance), may percentages be considered.

---

## 6. GO / NO-GO Gates

### 6.1 Matching GO (future benchmark target — from brief)

- Top-1 acceptable analogue (`A`) **>= 70%**
- Top-3 contains strong analogue (`A`) **>= 90%**
- Dimension-compatible Top-3 **>= 85%**
- Coverage (>=1 acceptable `A/B` within Top-10) **>= 80%**
- Human verification **< 2 min / asset** (for Top-10)

Do not claim these are achieved. They are success gates for F3 automation.

### 6.2 DATA GO (from `retail-access-feasibility-v1.md`)

- At least **ONE** retailer has a credible production-viable official data access path: permitted access, stable product identity, usable metadata, refreshable commercial state, acceptable operational burden.
- **Current status per F0: CONDITIONAL YELLOW for Yandex Market (requires two confirmations: Content API search under affiliate contract + image proxy/embedding rights). All others RED.**
- The program should not proceed to production ingestion without DATA GO.
- **Matching research may continue even if DATA GO is currently negative** — i.e., F2 benchmark can run against public HTML even while DATA GO is yellow.

---

## 7. Manual Verification Workflow (expected if F2 is executed)

1. Select 50 assets per 2.1-2.2, record their `dimensions` + `thumbnail`.
2. For each asset, open Hoff catalog first (furniture truth), browse same leaf category, note candidates whose hero image passes visual screening; record retailer `dimensions` if present on spec table.
3. Repeat against Market (aggregator) and Wildberries (prevalence) for same asset; deduplicate identical product cards already seen via Market aggregation where possible.
4. Normalize retailer dimensions to meters (if listed as `mm` or `cm`, convert; if `Sh x Gl x V` format, map `width=Sh, depth=Gl, height=V`).
5. Rank Top-K by human similarity (silhouette/proportions/material/color); do not use an automated matcher in F2.
6. Label Top-3 (or Top-10) per Section 4 (A/B/C/X) — at least 2 labelers, 20% overlap for agreement.
7. Compute Section 5 metrics; report per-category breakdown (sofas vs lamps etc.) and per-retailer breakdown (Hoff vs Market vs WB).
8. Record dead-link / out-of-stock / regional deltas one week later (re-check 10% sample) to estimate freshness sensitivity.
9. Estimate human time per asset for F3 cost.

All raw candidate records, screenshots, and per-asset notes live in `.agent-data/retail-research/` (uncommitted, git-excluded). Only aggregated metrics, label distributions, and derived insights are committed to `docs/research/retail/` if a follow-up report is written.

---

## 8. What F3 Would Automate If Benchmark Succeeds

- Candidate retrieval per `Category` + normalized dimension filter (hard gate) — requires a retailer Content/search API (hence DATA GO).
- Multi-view visual similarity: asset canonical renders (front, left 3/4, right 3/4, side, elevated, silhouette masks) vs retail hero images — embeddings + silhouette descriptors + proportions + dominant colors + materialFamily.
- Style/material reranking via normalized attributes (LLM as dirty-attribute normalizer, e.g., `velur Monolit -> velvet`, not primary matcher).
- Top-K ranking with internal numeric `score`, tier `A/B/C/X` as human-label-derived threshold, plus spatial-compatibility validation against current `RoomProject` (footprint fit, collision, clearance) to surface "replaceable subset".
- Periodic re-index with region-aware `RetailOffer` refresh (DAILY/HOURLY/REQUEST-TIME per retail-domain-model), respecting retailer rate limits (`X-RateLimit-*`) and attribution/location requirements.

F3 is not scope for F0. Do not build any of the above now.

---

## 9. Sample Asset Candidates (illustrative, not the final F2 selection)

To prove the 50-asset plan is feasible with current asset sources:

- From `registry.ts` (17): `sofa`, `nordicSofa`, `nordicArmchair`, `relaxArmchair`, `chair`, `sheenChair`, `table`, `glassCoffeeTable`, `drawerSideTable`, `lowBookcase`, `roundFloorLamp`, `lamp` — 12 immediately available.
- Remaining 38 from 836-manifest: select 8 additional sofas from `Seating`, 6 armchairs, 6 dining chairs, 3 coffee/side tables, 4 dining tables, 3 storage/TV units, 4 lamps — distribution per 2.1 is achievable without new assets.

No new 3D assets need to be authored before F2.

---

*Store any future benchmark candidate data under `.agent-data/retail-research/` and do not commit generated eval results, product images, or retailer HTML.*
