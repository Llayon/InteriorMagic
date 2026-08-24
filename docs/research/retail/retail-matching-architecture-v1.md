# Retail Matching Architecture v1 (proposal)

> Track F3 Phase 5 — future architecture only. Nothing here is implemented.
> Extends F0 `retail-domain-model-v0.md`; keeps planner/retail separation intact.

---

## Pipeline

```
Asset Semantic Core            (existing FurnitureAssetDefinition + semantic.role + shape.family)
      │ assetId, category, role, W/H/D, shapeFamily, material/color hints
      ▼
Candidate Retrieval            (retailer search/feed; per DATA-GO-approved source only)
      │ top-N raw candidates per asset
      ▼
Deterministic Filters          (category gate → semantic-role compatibility → dimension tolerance)
      │ safe set (top-10)                          ── failures logged as category/dimension errors
      ▼
Visual Reranker                (multi-view SigLIP: our canonical renders ↔ retailer images)
      │ visual similarity reorders within the safe set only
      ▼
Confidence Model               (calibrated blend: dims + role + material/style + visual; threshold ⇒ abstain)
      │
      ▼
RetailMatch                    (assetId, productId, tier A/B/C/X, score breakdown, evidenceVersion)
```

Invariants carried over from F0/F2:

- Deterministic filters are **never bypassed** by the visual model. Visual similarity may only
  reorder a dimension/category-safe candidate set.
- Similarity ≠ placement compatibility. `RetailMatch` feeds a *separate* room-validation step later;
  RoomProject never enters this pipeline.
- Planner consumes normalized physical facts only — never retailer URLs/prices.

## Stable vs dynamic data split

| Stable (`RetailProduct` / `RetailMatch`) | Dynamic (`RetailOffer`) |
|---|---|
| retailer, productId (marketArticle / LM-code / SKU class), canonical URL | price, currency |
| title, brand, category, normalized dimensions | availability, stock |
| attributes snapshot (raw text kept for normalization experiments) | delivery promise, method |
| match confidence + score breakdown + evidenceVersion | regionId, checkedAt |

Refresh classes (from F0): product identity/metadata ≈ DAILY; commercial state REQUEST-TIME for
single lookups, DAILY bulk where API allows; every dynamic value stamped with `checkedAt` and
region. Nothing dynamic is cached beyond the TTL confirmed commercially (currently unresolved).

## Ownership boundaries

- **Asset Catalog** owns asset semantics; knows nothing about retailers.
- **Retail Matching** owns retrieval, filters, reranking, confidence; reads assets via assetId.
- **Retail Catalog / Offers** own stable identity and volatile state respectively.
- **Planner/Spatial Core** receives `(dimensions, category, semantic facts)` of candidate matches
  when a replacement flow exists; blind to Hoff/Ozon/Lemana/Yandex, URLs, and affiliate economics.
- **Editor** commits user-chosen replacements only (planner proposes, editor commits).

## Failure & abstention policy

- Confidence below threshold ⇒ no match surfaced ("Другой вариант" tier in UX terms).
- Dimension-unsafe candidates are structurally unreachable (gate), not merely down-ranked.
- Every RetailMatch carries `evidenceVersion` so golden-set regressions are attributable.
- Negative results are first-class: no-match is preferable to a wrong substitute.

## Prerequisites before any production step

1. DATA GO confirmation on at least one retailer (F0/F2 status: CONDITIONAL YELLOW, Yandex Market).
2. Image-use rights for embedding generation (unresolved everywhere; blocks the reranker).
3. Human spot-check of golden labels (researcher proxy today).
4. F4 pilot reaching ≥70% of oracle rerank delta (see visual-rerank-experiment-v1.md §4).
