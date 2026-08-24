# Retail Domain Model v0 (provisional)

> Track F, Phase F0 — research-only schema sketch.
> Date: 2026-08-24. Base: `7a65036`.
> No runtime code in `src/` is added by this document. This is a research starting point for F1, not a finalized type system.
> It must stay separate from `src/editor/model/types.ts:1` (`FurnitureAssetDefinition`, `RoomProject`) until benchmark data proves necessity.

---

## 1. Purpose and boundary

InteriorMagic must keep three concerns strictly separate:

```
Asset Catalog              Retail Matching             Retail Catalog          Retail Offers          Room placement
(FurnitureAssetDefinition)  (this model)               (RetailProduct)         (RetailOffer)          (Planner, Spatial Core)
        | assetId                  | productId                  | productId                 | productId
        v                          v                            v                           v                       v
   3D asset  ------------>  match relation  ------------>  normalized product  --->  volatile commercial  --->  compatibility check
                          (RetailMatch)               identity                state per region         (footprint fits, collision,
                                                      (firstSeen/lastSeen)     (price, stock,            clearance, planner validity)
                                                                            delivery, checkedAt)
```

**Why retail data stays separate from `FurnitureAssetDefinition`:**

- `FurnitureAssetDefinition` is the 3D authoring / rendering truth (dimensions, footprint, thumbnail, GLB, normalization, variants). It is curated, versioned with the app, and never branches on `assetId` per `ARCHITECTURE.md` principle 6.
- Retail data is volatile, region-dependent, multi-seller, and externally governed. Mixing it into the asset definition would couple the planner to retailer economics, URLs, and affiliate terms. The planner must never know `Hoff` vs `Ozon` vs `Lemana`.
- The dependency is **one-way**: retail matching references `assetId`, but asset catalog never references `productId`.

### Dependency direction (binding)

```
Asset Catalog  --assetId-->  Retail Matching  --productId-->  Retail Catalog  --productId-->  Retail Offers
                                                                            |
                                                                            +--(RetailSourceSnapshot) provenance
```

- `RoomProject` and `PlanningScene` remain the spatial truth. `RetailMatch` and `RetailOffer` are not persisted inside `RoomProject`.
- Planner consumes only normalized physical facts derived from `RetailProduct.dimensions` plus its own spatial checks — never raw retailer URLs or affiliate metadata.

---

## 2. Provisional concepts

These are the **minimal** four concepts from the brief, adjusted only where retailer evidence demanded it. Do not add fields speculatively.

### 2.1 RetailProduct — stable normalized product identity

> "A real purchasable thing InteriorMagic has seen, independent of who sells it today and where."

Conceptually:

```ts
// RetailProduct — stable-ish normalized product identity
type RetailProduct = {
  retailer: 'lemana-pro' | 'hoff' | 'ozon' | 'yandex-market' | 'wildberries'; // extend as needed
  productId: string;          // stable retailer product ID — see 2.1.1
  canonicalUrl?: string;      // consumer-facing product URL, region-agnostic if possible
  title: string;              // normalized title as displayed on retailer (for matching, not authoring)
  brand?: string;             // extracted brand if reliably present in retailer data
  category: string;           // normalized InteriorMagic-facing category (mapped from retailer taxonomy)
  dimensions?: {              // normalized physical dimensions where retailer reliably exposes them
    width?: number;           // meters or mm normalized to meters — retailer evidence determines unit
    depth?: number;
    height?: number;
  };
  attributes: Record<string, string | number | boolean>; // raw retailer attributes kept for future
                                                             // material/style normalization (e.g., "velur Monolit")
                                                             // LLM may later normalize these to materialFamily
  firstSeenAt: string;        // ISO timestamp — when InteriorMagic first observed this product
  lastSeenAt: string;         // ISO timestamp — last successful observation
};
```

**2.1.1 Retailer-specific `productId` evidence (from F0):**

- **Lemana PRO:** `LM-kod` (LM code, e.g., 8-digit). Surrogate: URL slug under `lemanapro.ru/product/...` with region subdomain.
- **Hoff:** Hoff artikul / ID suffix (e.g., `80000252` in stock docs, `9293663` in URL suffix `..._id9293663`). Same ID is used across stock sync (`skus[]`).
- **Ozon:** product *card* id (consumer URL `ozon.ru/product/...`) — distinct from seller `offer_id`/`sku`/`barcode`. Ozon links identical products across sellers into one card by EAN/article/moderation.
- **Yandex Market:** `marketArticle` (e.g., `5828126315` in affiliate example, returned as `marketArticle` + affiliate-scoped `partnerArticle` like `YM10469939`). This is the aggregator-stable ID; one `marketArticle` can have many seller offers.
- **Wildberries:** `nmId` (SKU-level) + `imtId`/`root` (parent card). Official seller API uses `nmId`/`imtId`/`chrtId` + barcodes; storefront `sizes[]` carries price per variant.

**Dimensions note:** All retailers expose dimensions only where the seller supplied them and where the category mandates them. For furniture, Hoff is the most reliable; Ozon/WB dimensions are per-seller and heterogeneous. Treat `dimensions` as **optional** — matcher must work when it is absent (see retail-source-matrix).

**2.1.2 What RetailProduct does NOT contain:**

- No `price`, `stock`, `delivery`, `sellerId`, `regionId` — those belong to `RetailOffer`.
- No `RoomProject`, `PlanningScene`, `position`, `rotation`, `collision`, or planner scores.
- No retailer URL parameters for affiliate tracking (those belong to offer attribution, if at all).

---

### 2.2 RetailMatch — relation between InteriorMagic asset and RetailProduct

> "How similar is this real product to *this* 3D asset?" — retailer similarity, not room placement.

```ts
type RetailMatch = {
  assetId: string;            // InteriorMagic assetId — e.g., 'sofa', 'nordicSofa', 'chair'
  retailer: RetailProduct['retailer'];
  productId: string;          // references RetailProduct

  score: {
    overall: number;          // numeric ranker output, NOT shown to users before calibration
    category: number;         // hard gate: same category or not
    dimensions?: number;      // normalized size/proportion fit vs asset
    silhouette?: number;      // multi-view / silhouette similarity (future)
    material?: number;        // material family match
    color?: number;           // dominant color match
    style?: number;           // style family match (future, optional)
  };

  tier: 'A' | 'B' | 'C' | 'X'; // human label — see retail-benchmark-plan-v1.md
                                // A=STRONG SUBSTITUTE, B=REASONABLE ANALOGUE, C=WEAK, X=INCOMPATIBLE
  evidenceVersion: string;    // version of matcher/model that produced this score
  verifiedAt?: string;        // ISO — when a human verified this match (F2)
  // No planner fields here.
};
```

**Conceptual separation (from brief, binding):**

- *Retail similarity* (above): category, dimensions, silhouette, proportions, material, color, style.
- *Room placement compatibility* (separate, later): footprint fits, room containment, collision, clearance, planner validity.

A product may be **visually very similar but not spatially replaceable** in a given room. Architecture must be:

```
matcher -> Top-K similar products  (RetailMatch)
           |
           +-- current-room validation (planner/Spatial Core) -> replaceable subset
```

Do not put `RoomProject` state into the retail matching domain. The numeric `score` is internal; UX maps to `Otlichno podkhodit / Pokhozhiy variant / Drugoy variant` only after F2 calibration.

**Future 3D advantage (document, not implement):**

- One 3D asset can generate multiple canonical renders: front, left 3/4, right 3/4, side, elevated/top-ish, silhouette masks — enabling multi-view visual similarity without relying on a single retailer hero image.
- Potential descriptors: visual embeddings, silhouette descriptors, proportions, dominant colors, material family. LLM may normalize dirty textual attributes (`velur Monolit -> velvet`) but is not the primary matcher.

---

### 2.3 RetailOffer — current commercial / region-specific state

> "What does it cost and is it available *here, now*?" — volatile, per-region, per-seller.

```ts
type RetailOffer = {
  retailer: RetailProduct['retailer'];
  productId: string;          // references RetailProduct
  sellerId?: string;          // per-seller offer identity where retailer is marketplace (Ozon card vs seller offer_id, Market shopSku, Hoff warehouseId)
  regionId?: string;          // region/store/city key — e.g., Lemana logisticLocationId, Hoff warehouseId, Market geoId, Ozon/WB dest
  price?: number;             // current price in retailer currency (where exposed)
  currency: 'RUB';            // v1 is RUB-only; future extension if needed
  availability: 'in_stock' | 'out_of_stock' | 'unknown' | 'preorder' | 'limited';
  delivery?: {
    promiseDays?: number;     // e.g., Market affiliate returns `promise` (658 in example = delivery promise)
    method?: string;          // pickup / courier / store-pickup etc. (keep minimal until needed)
  };
  checkedAt: string;          // ISO — when this offer state was observed
};
```

**Region handling (verified):**

- Lemana: `logisticLocationId` (7000001-7999999, 1-500 SKUs per call) + region-subdomain.
- Hoff: `warehouseId` per `skus[] -> items[{type,count,updatedAt}]`; 61 stores / 23 cities.
- Ozon: per-warehouse stock + consumer `dest` (inferred from storefront `dest`).
- Market: `geoId` and contractually required city-precision display (legal 2.8).
- WB: `dest` + per-warehouse `offices()`.

Do not collapse offers across regions. A product may be in-stock in Moscow but out-of-stock in Novosibirsk — the offer model must keep them distinct. Refresh cadence is per-`checkedAt`, not per-`RetailProduct`.

---

### 2.4 RetailSourceSnapshot — provenance

> "Where did we learn this and when?" — auditability without storing raw HTML.

```ts
type RetailSourceSnapshot = {
  retailer: RetailProduct['retailer'];
  productId: string;
  retrievedAt: string;        // ISO — fetch time
  sourceKind:
    | 'official-api'          // e.g., Market affiliate POST /partner/article/create, Hoff suppliers.hoff.ru, Ozon api-seller.ozon.ru
    | 'official-portal'       // e.g., Lemana partner.lemanapro.ru card page (if approved)
    | 'manual-benchmark'      // human-curated F2 observation from public HTML (not for production ingestion)
    | 'unofficial-storefront' // e.g., WB search.wb.ru / card.wb.ru — recorded as non-production evidence only
  ;
  sourceVersion?: string;     // API version, OpenAPI hash, or page template version if known
  // Do not store raw HTML, cookies, or credentials here — keep those in local `.agent-data/retail-research/_raw/` (uncommitted).
};
```

**Provenance rules:**

- Raw HTML, screenshots, and temporary tables live only in `.agent-data/retail-research/` (git-excluded via `.git/info/exclude`).
- Committed docs (`docs/research/retail/`) keep only derived evidence: URL, title, date, short quote/paraphrase — see `_sources.md`.
- No secrets, no API tokens, no cookies in snapshots.

---

## 3. What the planner sees and does not see

**Planner consumes (from RetailProduct, if match is selected):**

- `dimensions?` (normalized width/depth/height) + `category` + minimal semantic facts (e.g., `sofa` vs `armchair`) — to run footprint/collision/clearance checks.

**Planner must NOT know:**

- `retailer`, `canonicalUrl`, `price`, `affiliate` economics, `checkedAt`, `sellerId`, `regionId` beyond the fact that the *candidate dimensions* came from a validated match.

```
Retail Matching  ----- dimensions + category ----->  Planner / Spatial Core
     |                                                  |
     +-- retailer, URL, price, affiliate  (never) ------+-- (blind to these)
```

This preserves `ARCHITECTURE.md` boundaries: metadata describes, rules prescribe; `PlanningScene` is disposable; `RoomProject` remains truth; planner proposes, editor commits.

---

## 4. Changes from the brief proposed split

- **No fields added speculatively.** The brief suggested `firstSeenAt/lastSeenAt` on RetailProduct and `tier/evidenceVersion/verifiedAt` on RetailMatch — retained as-is because retailer evidence supports stable vs volatile separation.
- **Market `partnerArticle` noted:** For Yandex Market, the affiliate-scoped `partnerArticle` (e.g., `YM10469939`) is stored as a derived affiliate key, not as `productId`. The stable `productId` remains `marketArticle` (`5828126315`). This is the one retailer where a second affiliate-specific ID exists.
- **Region generalized:** The brief suggested `regionId?` only on RetailOffer; F0 evidence proves region must be first-class on `RetailOffer` and must be per-`(productId, regionId)` with `checkedAt` per region — made explicit here.
- **SourceKind narrowed:** Added `unofficial-storefront` as an explicit kind so future benchmark can honestly label WB `search.wb.ru` evidence as non-production without inventing a separate model.

No other major changes.

---

## 5. Open questions for F1 (not for this doc to decide)

- Should `category` be a closed enum (`sofas/chairs/...`) or an open string mapped from retailer taxonomy? F2 will decide after measuring category-error rate with the current 6-value `Category` plus ITHappy 9-value `displayCategory`.
- Should `dimensions` keep retailer-raw units or normalize to meters immediately? Lean toward meters (InteriorMagic canonical is meters) but defer until bulk data proves unit consistency.
- Should `attributes` keep raw retailer keys verbatim or map to a small normalized key set (`materialFamily`, `upholstery`, `frameMaterial`)? Keep raw now; LLM normalization is a future F1 helper, not a schema change now.

---

*This is a provisional research schema. Do not generate runtime `src/` types from it until F2 validates that the 50-asset benchmark needs these boundaries.*
