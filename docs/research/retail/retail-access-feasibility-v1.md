# Retail Data-Access Feasibility v1

> Track F, Phase F0 — research only.
> Base: `7a65036cdb3c912314de660bd95dbe5cc1b090d1` (`main`, Build first beautiful room baseline).
> Branch: `research/retail-matching-v1`. Worktree: `.agent-worktrees/retail-matching-v1`.
> Date: 2026-08-24.
> No runtime code, no scraping, no ingestion.

---

## 1. Executive Summary

**Product thesis:** InteriorMagic owns structured 3D furniture assets. A future step connects each virtual asset to a real purchasable analogue, ultimately supporting "replace virtual with real" under spatial-compatibility checks. This requires *two* capabilities: (1) finding a visually similar product, (2) confirming its physical dimensions fit the room. The matcher is assumed solvable; the blocking question is data access.

**Central finding:** None of the four primary Russian retailers exposes a public, documented, consumer-catalog search API usable by an arbitrary third party without a seller or affiliate contract. All official APIs found are **seller-scoped** (the caller manages its own listings) or **corporate-procurement-scoped** (B2B buyers of Lemana). Each *does* have an affiliate path, but affiliate != catalog API everywhere.

**Implication:** There is no turnkey DATA GO path today that lets InteriorMagic crawl arbitrary catalog data with a single API key and no commercial approval. There *are* plausible conditional paths — most credibly through **Yandex Market affiliate Content/Affiliate API** — but each requires a signed agreement, attribution compliance, and legal clarification on image/data rights. Hoff and Lemana PRO are institutionally focused on supplier onboarding, not third-party catalog syndication. Ozon and Wildberries confirm the same seller-only pattern.

**Bottom line:** F0 delivers a negative DATA GO with a conditional yellow path for one retailer, not a green production integration candidate. Manual benchmark feasibility is separate and positive — all four retailers expose rich public HTML product pages suitable for human evaluation, and Hoff is the cleanest furniture source for that.

---

## 2. Method

- Preferred source order: (1) retailer official developer/API docs, (2) official affiliate/partner docs, (3) official legal/terms, (4) official catalog pages, (5) changelogs, (6) reputable secondary as support only.
- Each material claim is labeled `VERIFIED FACT / INFERENCE / UNKNOWN` in `_sources.md`.
- Search/fetch was performed 2026-08-24 against official domains (`lemanapro.ru`, `developers.lemanapro.ru`, `hoff.ru`, `suppliers.hoff.ru`, `docs.ozon.ru`, `api-seller.ozon.ru`, `yandex.ru/dev/market`, `dev.wildberries.ru`). Pages that returned 401/Cloudflare blocks are recorded as official but not fetchable.
- No credentials were used, no robots.txt was bypassed, no anti-bot was circumvented.
- Absence of documentation is marked `UNKNOWN`, never converted to `ALLOWED` or `NOT ALLOWED`.

---

## 3. InteriorMagic Asset Readiness (verified in this worktree)

### 3.1 Current truth

Verified in `src/editor/model/types.ts:1` and `src/editor/assets/registry.ts:1`:

```ts
type Category = 'sofas' | 'chairs' | 'tables' | 'plants' | 'lamps' | 'rugs';
type FurnitureSemanticRole = 'sofa' | 'armchair' | 'coffeeTable' | 'sideTable' | 'console' | 'rug' | 'floorLamp' | 'plant' | 'floorDecor';

interface FurnitureAssetDefinition {
  id, name, icon,
  modelUrl?, thumbnailUrl?,
  dimensions: { width, height, depth },
  footprint: { width, depth },
  placement: { anchor: PlacementAnchor },
  collision: { group, mask }, snapping, rotation,
  interaction?: { paddingXZ?, minHeight? },
  normalization?: { scale?, rotationEuler?, translation?, recenterToFootprint? },
  variants: FurnitureVariant[]
  category, tags[], semantic?: { role }, fallbackPrimitive
}
```

- Registry holds 17 hand-curated assets (7 legacy fixture + 10 Kenney CC0 trial). Examples: `sofa 2.05x0.96x0.85`, `nordicSofa 2.02x0.72x0.74`.
- `ASSET_GUIDE.md:1` canonical contract: `1 unit = 1 m`, `+Y up`, forward `+Z`, origin at footprint centre on `y=0`.

### 3.2 What already supports Track F

- **Sufficient:** `assetId`, `category` (coarse but usable as hard gate), `dimensions` + `footprint`, `thumbnailUrl` (proven lazy 256x192 WebP budget: 1.6 MB for 836 in ITHappy catalog build), `semantic.role`, `tags`, `modelUrl` + `normalization` for future canonical renders.
- **Secondary stash (not in `registry.ts`, in `.agent-data/ithappy-catalog-build/manifests/catalog-payload.json`):** 836-entry manifest with `displayCategory` (9 values), `runtimeBytes`, `triangleCount`, `textureCount`.

### 3.3 Missing / minimal

- No explicit `materialFamily` (only raw `materialOverrides` keys like `upholstery`, `wood` and per-variant hex `color`).
- No `style` taxonomy, no `proportions` descriptor, no `dominantColor` beyond variant hex.
- No dimension tolerance metadata for retail matching.

**Judgment:** No mass metadata migration is needed before F2. The 50-asset benchmark can proceed with current `category + dimensions + thumbnail + semantic.role`. Optional enrichment after F2 proves necessity.

---

## 4. Retailer-by-Retailer Analysis

### 4.1 Lemana PRO — 1st priority

> Former Leroy Merlin Russia; largest DIY chain, 112 stores, 11 darkstores, 6 DCs.

**A. Product fit — MEDIUM**

- Assortment: tens of thousands of SKUs across construction, finishing, home & garden. Affiliate commission categories explicitly include Khranenie, Kukhni, Plitka, Napolnye pokrytiya, Kraski, Osveshchenie, Oboi, Tekstil (6.5%) — source: pampadu/admitad. Furniture is present (kitchen sets, storage systems) but not core. `sofas / armchairs / chairs / coffee tables` are thin compared to Hoff; `storage / kitchens / lighting / textiles` are strong.
- Rationale for MEDIUM: InteriorMagic benchmark furniture categories are lateral to Lemana DIY anchor. Useful for `storage / TV units / lamps / side tables`, weaker for `sofas / armchairs`.

**B. Official data access — NO public consumer catalog search API**

Two distinct, documented API families — neither is a public catalog read API:

1. **Marketplace API (for sellers/merchants)** — VERIFIED FACT
   - Docs: `https://developers.lemanapro.ru/partners-started/` and `/api_partners/` (OpenAPI).
   - Intended user: approved merchants/sellers selling *on* Lemana marketplace (registration at `lemanapro.ru/postavshchikam/new-marketplace/`, request via `forms.yandex.ru/cloud/686bc8bfeb6146a4f68f8cc3/`).
   - Auth: `client_id + client_secret -> POST https://partners.auth.lemanapro.ru/realms/partner/protocol/openid-connect/token` (client_credentials, 300s expiry) — source: `/partners-authorization/`.
   - Capabilities: read own products by LM-codes (Tovary — single paginated GET), upload prices (write-only batch), read/update stocks per `logisticLocationId` (7000001-7999999, 1-500 SKUs per call), manage orders/shipments, download PDF docs — source: selsup secondary + official "Vozmozhnosti" list.
   - Gaps: no card creation via API (cards created on `partner.lemanapro.ru` portal with moderation), no reading current showcase price via API (write-only), stock per-warehouse only. Rate: 100 req/min per method (official "Ogranicheniya").
   - **Search arbitrary catalog: NO. Read arbitrary product: NO. Enumerate all categories: NO** (only own assortment by LM-code).

2. **B2B API (for corporate procurement clients)** — VERIFIED FACT
   - Docs: `https://developers.lemanapro.ru/api_b2b/` and changelog `https://developers.lemanapro.ru/release-notes/` (2025-04-24: assortment with characteristics, prices, order creation).
   - Intended user: B2B clients *buying from* Lemana (requires `b2b_integration@lemanapro.ru` approval).
   - Not a third-party catalog syndication channel.

- **Consumer catalog search API: none found** (UNKNOWN if internal undocumented storefront JSON exists; not documented as public).

**C. Affiliate / commercial program — VERIFIED, distinct from catalog API**

- Official: `https://partners.lemanapro.ru/` (landing: "Do 6.5% s kazhdoy pokupki"). Also via Admitad, Pampadu, Gde Slon.
- Model: CPA on paid order, 30-day confirmation, min payout 1000 RUB. Commission category-dependent:
  - Cat 1: 6.5% (storage, kitchens, tiles, flooring, paints, household, decor finishing, lighting, wallpaper, textiles)
  - Cat 2: 3.49% (carpentry, windows/doors, HVAC, plumbing, garden, seasonal)
  - Cat 3: 1.24% (electrical, tools, building materials)
  - Cat 4: 0.1% (items marked "Luchshaya cena")
  - App orders: 3.08% — sources: pampadu + partnerkin + partprog.su (concordant).
- Access: registration with INN/KPP, legal entity, traffic source review, contract required. No public catalog feed included.
- **Affiliate != catalog API** confirmed: `partner.lemanapro.ru` (merchant) vs `partners.lemanapro.ru` (affiliate) are different systems — source: selsup explainer.

**D. Data rights — REQUIRES COMMERCIAL/LEGAL CONFIRMATION**

- Terms reviewed: `https://krasnoyarsk.lemanapro.ru/pravila/` regulates buyer/order relations, not API data reuse. No API Terms of Use page with data-rights language discovered.
- Classification (no official data-license found):
  - display title / attributes / brand / price with attribution: UNKNOWN
  - cache price / availability: UNKNOWN
  - store images / proxy / embeddings / derived descriptors / retention / re-index: REQUIRES COMMERCIAL/LEGAL CONFIRMATION — prefer UNKNOWN over LIKELY ALLOWED per correction.

**E. Product identity — LM-code as stable ID (INFERENCE)**

- Marketplace API references `LM-kody` as canonical product identifier. Canonical URL pattern is `https://lemanapro.ru/product/...` with region subdomain (`krasnoyarsk.lemanapro.ru`, `spb.lemanapro.ru`). Multi-seller offers: possible via marketplace sellers vs first-party, but not documented.

**F. Region awareness — HIGH (VERIFIED)**

- Site is region-subdomained; delivery, availability, price vary by store/region. Marketplace stock is per `logisticLocationId`. Region affects catalog availability — material.

**G. Freshness**

- Marketplace stocks: >=2x/day mandatory. Prices via batch upload (write-only). B2B prices: on-request. For consumer catalog mirroring: UNKNOWN. Conceptual class: DAILY if via approved seller sync; otherwise UNKNOWN.

**H. Production risk**

| Dimension | 0-5 | Rationale |
|---|---|---|
| Data-access certainty | 1 | No public catalog search; two approved-only APIs, both wrong persona. |
| Commercial fit | 3 | Affiliate exists with clear commissions; monetization viable if catalog access separate. |
| Catalog fit | 2 | DIY anchor; storage/kitchen/lighting strong, upholstered furniture weak. |
| Operational maintainability | 1 | IP-allowlisted auth, manual approval, portal moderation. |

**Overall: RED** — requires partnership negotiation.

---

### 4.2 Hoff — 2nd priority

> 61 hypermarkets in 23 cities, 7 000 staff, >20 M store visitors/yr, 66 M unique site visitors/yr. >80 000 SKUs.

**A. Product fit — HIGH**

- Assortment is furniture-native: sofas, armchairs, chairs, tables (dining/coffee/side), TV units, storage, beds, kitchens, lighting, textiles, decor. Hoff marketplace ("Domashniy marketpleys", launched 2019) extends assortment with third-party furniture suppliers. Closest 1:1 match to InteriorMagic categories.

**B. Official data access — NO public consumer catalog API**

- Public catalog API: none documented at `hoff.ru` or `dev.hoff.ru`. HoffTech GitHub org (2 repos, 3 followers, since 2019) exposes no catalog API.
- **Supplier-facing APIs (verified via secondary docs describing official endpoints):**
  - Portal: `https://suppliers.hoff.ru` — registration, contract, assortment/prices/stocks via personal cabinet; terms at `/supplier/legal-documents/terms-of-use` (VERIFIED FETCH).
  - Stock sync: `https://prod-vendremains.hoff.ru/VendInventoryReader/` — JSON over POST, IP-allowlisted (supplier emails `sendstock@hoff.ru`), three methods: (1) Hoff JSON push with supplier IP + `warehouseId/skus`, (2) Hoff polling supplier-provided URL, (3) CSV via static web link (`;` delimited, 2 cols), all >=2x/day — source: 1clancer secondary reproducing Hoff instruction PDF.
  - EDI: `ORDERS/ORDRSP/DESADV` + UPD via Saby/Tensor.
  - Marketplace portal: Napoleon IT + Hoff Tech joint supplier portal (PIM/ERP/BI integrated).
- **Consumer catalog search: not exposed** — verified absent from official docs.

**C. Affiliate / commercial program — EXISTS but fragile**

- Own program via `advcake.ru/lp/hoff/` : "do 10,9% za vyykuplennyy zakaz". Admitad listing states "K sozhaleniyu ... v dannyy moment nedostupna" (VERIFIED). Sostav article notes: 30-day cookie, 5-10.9% range, context advertising **forbidden** (4 prohibitions), cashback interception is material risk.

**D. Data rights — REQUIRES COMMERCIAL/LEGAL CONFIRMATION**

- Fetched `suppliers.hoff.ru/supplier/legal-documents/terms-of-use` governs portal usage, not consumer data reuse. No catalog data license found. Per correction, image storage/proxy/embeddings are UNKNOWN / REQUIRES CONFIRMATION.

**E. Product identity — Hoff SKU as stable ID; marketplace introduces seller overlay**

- Primary ID: Hoff artikul (e.g., `80000252`, `9293663`). URL pattern: `https://hoff.ru/catalog/.../krovat_s_podemnym_mekhanizmom_angela_id9293663/`.

**F. Region awareness — HIGH**

- 61 stores in 23 cities, Hoff Mini / Hoff Home / Diskont; delivery, pickup, assembly are city-dependent. Stock is per warehouseId.

**G. Freshness**

- Stocks: >=2x/day mandatory supplier push/poll. For third-party reader: UNKNOWN, conceptual DAILY if via supplier approval.

**H. Production risk**

| Dimension | 0-5 | Rationale |
|---|---|---|
| Data-access certainty | 1 | No public catalog API; supplier approval + IP allowlist required. |
| Commercial fit | 3 | Strong furniture monetization (10.9% headline), but affiliate != catalog and Admitad unavailable. |
| Catalog fit | 5 | Perfect furniture anchor — best among four. |
| Operational maintainability | 1 | Manual onboarding, single personal cabinet, IP-gated stock sync. |

**Overall: RED for automated ingestion, GREEN for manual benchmark.** Hoff is best furniture catalog for manual validation.

---

### 4.3 Ozon — 3rd priority

> Largest Russian marketplace by SKUs; furniture is major but supplier-heterogeneous.

**A. Product fit — HIGH**

- Marketplace covers all InteriorMagic furniture categories plus storage/TV units/lamps. Official category tree is exposed via Seller API. Breadth is HIGH, though data quality is heterogeneous.

**B. Official data access — seller-scoped only**

- **Official Seller API: `https://docs.ozon.ru/api/seller/` -> `https://api-seller.ozon.ru` — VERIFIED FACT** (redirect observed; secondary mirrors at `github.com/dragonsigh/ozon-seller-api-docs` with 66 files, `apis.io` entry, `npm:ozon-nld-sdk` with 410 methods).
  - Intended user: registered Ozon sellers (obtain `Client-Id + Api-Key` at `seller.ozon.ru/app/settings/api-keys`).
  - Auth: `Client-Id + Api-Key` headers, POST-only, per-operation version path (`/v3/product/list`, `/v4/product/info/prices`).
  - Capabilities (for own assortment): `productApiGetProductList` (visibility: ALL), `productApiGetProductInfoList` (by offer_id/sku), category tree, price/stock/warehouse/order/finance. 420 Seller + 46 Performance methods.
  - Limits: ~60 req/min for most methods (secondary citing official), batch 1000 for prices, 512 KB body.
  - **Cannot:** search arbitrary public catalog, enumerate arbitrary products as consumer.
  - **No public consumer catalog search endpoint is documented**.

- **Unofficial scrape wrappers (NOT official):** Parse.bot describes 8 endpoints (`search_products`, `get_product_details` returning `sku,url,price,title,images[],rating,description,review_count,characteristics[]`). This is a commercial scraping abstraction, not an Ozon-official API.

**C. Affiliate / commercial program — EXISTS, separate from Seller API**

- **Ozon Blogger** (launched 2025-05-25 per seonews/ebrun): zero follower threshold, self-employed status, supports `VK` + `MAX`, Ozon handles ad labeling via ORD OZON, analytics in Ozon app dashboard. Commission up to ~50% in some categories (headline; per-category varies).
- **Admitad / GdeSlon**: Ozon listed among marketplace offers, but commission not disclosed without auth.
- **Affiliate != catalog API** is explicit: Blogger gives dashboard to select products and get links, not an API to enumerate all products with dimensions.

**D. Data rights — REQUIRES COMMERCIAL/LEGAL CONFIRMATION**

- No Ozon API terms page with data-reuse license was fetched. Seller API governed by seller agreement. Image proxy/embeddings are REQUIRES CONFIRMATION.

**E. Product identity — shared card + seller offers (VERIFIED via secondary quoting official behavior)**

- "Kombiniruet identichnye produkty ot raznykh prodavtsov v odnu kartochku. Svyazyvanie po shtrikh-kodu (EAN), artikulu proizvoditelya ili cherez ruchnuyu moderatsiyu." — source: novasolutions. This confirms `RetailProduct (card) != RetailOffer (seller SKU)`.

**F. Region awareness — HIGH**

- Storefront search has `dest` param affecting price/stock/delivery. Seller stock is per warehouse; consumer price varies by region.

**G. Freshness**

- For seller own catalog: price import 1000 per request, sync cron every 15-30 min per Nova. For arbitrary consumer catalog as third party: no SLA — UNKNOWN.

**H. Production risk**

| Dimension | 0-5 | Rationale |
|---|---|---|
| Data-access certainty | 1 | Well-documented Seller API, but persona is wrong (seller-only). |
| Commercial fit | 3 | Marketplace breadth high, affiliate up to 50% headline but creator-platform-specific. |
| Catalog fit | 4 | High breadth, but heterogeneous dimensions. |
| Operational maintainability | 2 | Mature versioned API, but using it to emulate catalog search would be abuse of role. |

**Overall: RED for InteriorMagic-as-third-party catalog search.**

---

### 4.4 Yandex Market — 4th priority (most credible conditional DATA GO)

> Aggregator marketplace + content platform; strongest taxonomy; two distinct official API families.

**A. Product fit — HIGH**

- Aggregator covers all InteriorMagic categories; furniture depth is material. Affiliate instruments explicitly mention "spiski tovarov v raznykh kategoriyakh".

**B. Official data access — two families, both contract-gated, one is closest to catalog syndication**

1. **Partner (Seller) API — `https://yandex.ru/dev/market/partner-api/doc/ru/` — VERIFIED FACT**
   - Intended user: merchants/businesses managing *own* offers (`businessId`/`campaignId`), auth via `Api-Key` or OAuth.
   - Capabilities: `POST v2/businesses/{businessId}/offer-mappings/update`, `POST v2/categories/tree`, `POST v2/category/{categoryId}/parameters`, etc. — source: `getOfferMappings` fetch.
   - Limits: global 4 parallel, 512 KB body — source: `partner-api/doc/ru/concepts/limits` (VERIFIED).
   - **Arbitrary catalog search: NO** — only own catalog per `businessId`.

2. **Affiliate / Referral API — `https://yandex.ru/dev/market/affiliate/ru/` — VERIFIED FACT**
   - Docs: `concepts/market-api-intro`, `concepts/limits`, `reference/get-partner-article`, legal `yandex.ru/legal/market_affiliate_api/ru` (all fetched).
   - Intended user: affiliate partners under Distribution contract (obtain `API-Key` + `clid`).
   - **Closest to catalog syndication among all four:**
     - Endpoint `POST /partner/article/create` (`https://api.content.market.yandex.ru/v3/affiliate/partner/article/create?clid=...`) creates referral article for known `marketArticle` or `marketUrl` and **returns** Market data: `partnerArticle, marketArticle, clid, vid, productPhoto, title, link, price, promise, rewardInUrl, stockAmount` — source: `get-partner-article` (VERIFIED). Response already carries `price` + `stockAmount` + `productPhoto`.
     - Broader Content API (`yandex.ru/dev/market/content`) likely provides `GET /v2/models` and `GET /v2/search` with `geoId`, `categoryId`, filters, prices, images, characteristics. This was not individually fetched and is therefore INFERENCE / UNKNOWN whether bundled with affiliate contract.
   - Limits (affiliate): **5 req/sec + 400 000 req/day** with `X-RateLimit-*` headers, 403 on exceed — source: `affiliate/ru/concepts/limits` (VERIFIED).

**C. Affiliate / commercial program — VERIFIED, most mature**

- Official: `https://aff.market.yandex.ru/instruments` — tools: affiliate links, informers, **API partnerskoy seti**, partner article, chatbot.
- Commission: per-item `tariffName`/`tariffRate` per order (example: `FASHION 0.088`, `KIDS 0.081`). Headline "do 14%" appears in Marketplace materials but not verified in fetched docs — mark UNKNOWN.
- **Affiliate includes a data-serving API** — uniquely among the four — documented at `yandex.ru/dev/market/affiliate/`.

**D. Data rights — most documented, but still restrictive**

- Legal: `https://yandex.ru/legal/market_affiliate_api/ru` (2024-12-05, VERIFIED).
  - 2.4: must not delete/hide/modify data including trademarks/logos/links; must display "Dannye servisa Yandex Market" as hyperlink with logos — ALLOWED with attribution, RESTRICTED without.
  - 2.6: data only on pages "svyazannykh s sootvetstvuyushchimi tovarami", no search-spam — RESTRICTED placement.
  - 2.7: must not modify data including sorting; may supplement only if no distortion — RESTRICTED.
  - 2.8: **must show data corresponding to end-user location** (city-precision) — legal requirement.
  - 2.9: no third-party contextual ad networks on pages showing Market data (except YAN) — RESTRICTED monetization adjacency.
  - 3: exclusive rights belong to Yandex; agreement grants no rights beyond interface.
  - 4.1: Service+Data provided "kak est" without guarantees of accuracy/completeness/timeliness.
- For Track F items: display with attribution ALLOWED; cache, store images, proxy, embeddings, retention are REQUIRES CONFIRMATION / UNKNOWN per correction.

**E. Product identity — marketArticle as stable product, shop SKU as offer**

- Affiliate `POST /partner/article/create` takes `marketArticle` (e.g., `5828126315`) and returns `partnerArticle` (`YM10469939`). `marketArticle` is stable RetailProduct; `shopSku + campaignId/businessId` are per-seller RetailOffer. One marketArticle can have multiple seller offers (aggregator model) — INFERENCE from Partner API shape.

**F. Region awareness — STRONG, and contractually required**

- 2.8 mandates location-accurate display (city precision). Order availability, price, delivery are region-dependent.

**G. Freshness**

- Affiliate `get-partner-article` returns `price` + `stockAmount` + `promise` at request time — REQUEST-TIME for single-product lookup. For bulk: DAILY plausible under 400k/day + 5/sec. No documented cache SLA; 4.1 disclaims timeliness guarantees.

**H. Production risk**

| Dimension | 0-5 | Rationale |
|---|---|---|
| Data-access certainty | 3 | Only retailer where affiliate response already returns title+price+stock+image for known ID with documented auth + limits. Bulk search unverified. |
| Commercial fit | 3 | Affiliate is real with per-item tariffRate; commission sub-14% and category-dependent. |
| Catalog fit | 5 | Aggregator = full category coverage. |
| Operational maintainability | 3 | Well-documented dual API families, clear limits, 400k/day headroom — but strict attribution/placement/geo/ad-network constraints. |

**Overall: YELLOW (conditional).** Green would require (a) confirming Content API search under same affiliate contract, and (b) legal confirmation that caching/proxying images for embedding is permitted.

---

### 4.5 Wildberries — optional

> Largest Russian marketplace by consumer orders; furniture is major but long-tail.

**A. Product fit — HIGH**

- All furniture categories present; marketplace breadth comparable to Ozon.

**B. Official data access — seller-scoped only**

- Official: `https://dev.wildberries.ru/en` + `/docs/openapi/api-information` — VERIFIED.
  - Intended user: registered WB sellers. Token types: Personal (on-prem, advanced), Service (single cloud service from catalog), Base (limited), Test (sandbox).
  - Capabilities (seller-owned): Products (categories/subjects/characteristics, cards CRUD, media, pricing), Orders, Finances, Analytics. Rate examples: 100 req/min content read, 10 req/min mutations, 300 req/min warehouses.
  - **No official public consumer catalog search API** for reading arbitrary products as third party. Storefront internal JSON (`search.wb.ru`, `card.wb.ru`, `basket` CDN) is described in secondary `dev.to/actorforge` but is **not part of official WB API**.

**C. Affiliate — LIMITED / fragmented**

- No official WB platform affiliate discovered. `Catuik` describes bloggers/coupon/cashback for *sellers* that create own offers — seller-created, not platform-wide. No stable commission table.

**D. Data rights — UNKNOWN / REQUIRES CONFIRMATION**

- No WB terms governing third-party catalog reuse fetched.

**E. Product identity — nmId / imtId split**

- Unofficial storefront uses `nmId` (SKU-level) + `root`/`imtId` (parent card), with `sizes[]` carrying price.

**F. Region awareness — HIGH**

- `dest` param in storefront search indicates destination/region affects price/stock/delivery.

**G. Freshness**

- Seller stocks/prices via discounts-prices-api; seller-side HOURLY/DAILY plausible. Consumer catalog via unofficial JSON could be REQUEST-TIME, but not production-viable.

**H. Production risk**

| Dimension | 0-5 | Rationale |
|---|---|---|
| Data-access certainty | 0 | No official third-party catalog read API; unofficial JSON is not documented integration. |
| Commercial fit | 1 | No platform affiliate; seller-negotiated is fragmented. |
| Catalog fit | 4 | High breadth, heterogeneous quality. |
| Operational maintainability | 1 | 4 token types, seller-only persona. |

**Overall: RED.** Useful manual benchmark secondary, not DATA GO candidate.

---

## 5. Cross-Retailer Synthesis

### 5.1 API vs affiliate distinction

| Retailer | Consumer catalog search | Seller/partner catalog (own goods) | Affiliate program | Affiliate includes catalog data? |
|---|---|---|---|---|
| Lemana PRO | NO | YES — Marketplace API + B2B | YES — partners.lemanapro.ru + Admitad | NO |
| Hoff | NO | YES — suppliers.hoff.ru + prod-vendremains | YES — AdvCake (10.9%); Admitad currently unavailable | NO |
| Ozon | NO | YES — api-seller.ozon.ru | YES — Ozon Blogger (VK/MAX) + Admitad | NO |
| Yandex Market | CONDITIONAL — via affiliate/Content family | YES — api.partner.market.yandex.ru | YES — aff.market.yandex.ru | YES (partial) — partner/article returns title+photo+price+stock |
| Wildberries | NO | YES — dev.wildberries.ru | NO platform program | NO |

### 5.2 Manual vs production feasibility

- **Manual benchmark (human browsing):** All four feasible; **Hoff is best for furniture truth** (clean taxonomy, consistent dimensions/specs), **Wildberries is best for volume/coverage spot-checks**, **Market is best for breadth**, **Lemana is best for DIY/storage**.
- **Production automated ingestion:** RED for all except Market (YELLOW).

### 5.3 Region handling

- All four are region-aware. Market makes region-aware display a **legal requirement** (2.8). Future RetailOffer must be `(productId, regionId)`.

---

## 6. Answers to the 10 Required Questions

1. **Best production integration candidate?** — **Yandex Market, conditionally (YELLOW).** Only retailer where documented affiliate response already carries product data, and where plausible search extension exists pending confirmation.

2. **Best manual / product-value benchmark source?** — **Hoff (furniture truth) + Wildberries (volume) secondary.** Hoff is cleanest furniture-native assortment; WB is largest order base for prevalence check.

3. **DATA GO?** — **CONDITIONAL NO (YELLOW) — no unconditional Green.** Strongest path requires two confirmations: (a) Content API search under same affiliate contract, and (b) caching/proxying images for embedding permitted.

4. **Useful but currently blocked?** — **All four.** Each blocked by persona mismatch (you are not the seller), not API quality.

5. **Affiliate compatible with catalog retrieval?** — **Separate for Lemana, Hoff, Ozon, WB; partially compatible for Market.**

6. **Can product images legally support future visual matching?** — **UNKNOWN / REQUIRES COMMERCIAL/LEGAL CONFIRMATION for all retailers.** No official terms explicitly permitting image proxying, persistent storage, embedding generation, derived descriptors, retention after delisting, or periodic re-index were discovered.

7. **How region-dependent?** — **High across the board, and contractually mandated for Market.**

8. **Can we separate stable product identity from changing offer state?** — **Yes, retailer-specific boundaries verified (LM-code, Hoff SKU, Ozon card vs offer_id, Market marketArticle vs shopSku, WB nmId/imtId).** Confirms provisional domain split RetailProduct vs RetailOffer.

9. **What existing InteriorMagic asset metadata is already sufficient for F2?** — **`category + dimensions/footprint + thumbnail + semantic.role` are sufficient for 50-asset benchmark.**

10. **What MINIMUM missing metadata should eventually be added?** — **None before F2.** If F2 reveals systematic errors, smallest enrichment: normalize 9-value displayCategory mapping and derive lightweight materialFamily from existing materialOverrides keys.

---

## 7. Recommendations

1. **Do not invest in matcher implementation ahead of commercial reply for Market.** Gate F1 on two answers: (a) Content API search available under same affiliate Distribution key, and (b) image proxying/storage for embedding permitted with what retention/caching constraints.

2. **Run F2 manual benchmark against Hoff as primary, Market as breadth, WB as prevalence.**

3. **Treat DATA GO and matching quality as independent gates.** Even if Data GO confirms, F2 matching gate may fail for long-tail sellers with poor dimension hygiene.

4. **Design future ingestion as (marketArticle, geoId)-keyed offers with request-time price/stock + DAILY enumeration, respecting 5/sec + 400k/day headers and city attribution.**

---

## 8. Risks (material only)

- **Persona mismatch is systemic.** All official catalog APIs are seller-facing. Using seller role to emulate consumer search would violate terms.
- **Image/embedding rights are unresolved everywhere.** Even Market reserves exclusive rights and limits use to interface-provided capabilities.
- **Rate and approval are human.** Lemana 100 req/min + IP allowlist, Hoff sendstock IP setup, Market "may refuse without explanation", WB 4-token governance — business development timeline.
- **Affiliate attribution cannibalization is real.** Hoff case notes cashback interception; Market enumerates 14 non-payment reasons including FULL_CART_COUPON, BANNED_REGIONS, PARTNER_PROMO_CODE.
- **Data quality varies inversely with breadth.** Ozon/WB large but inconsistent dimensions; Hoff/Lemana curated but furniture-thin or portal-heavy.
- **Region is not a feature — it is a legal constraint for Market.**

---

## 9. What Was Not Done

- No retailer API client, scraper, crawler, embeddings, vector DB, image downloader, render pipeline, or persistence was implemented.
- No runtime Types (RetailProduct etc.) added to `src/`.
- No FurnitureAssetDefinition fields modified.
- No credentials stored, no raw catalogs copied, no `.agent-data/retail-research` content committed.

---

*This document is technical/product research, not legal advice. Data-rights classifications default to UNKNOWN / REQUIRES COMMERCIAL/LEGAL CONFIRMATION where no official terms were found.*
