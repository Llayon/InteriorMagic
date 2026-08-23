# Retail Source Matrix v1

> Compact comparison of the five investigated retailers.
> Detail per retailer is in `retail-access-feasibility-v1.md`.
> Date: 2026-08-24. Base: `7a65036`.
> Ratings normalized per brief correction: 0=unusable, 1=severe blocker, 2=major unresolved, 3=plausible with material unknowns, 4=credible minor unknowns, 5=directly documented usable.

---

## Matrix

| Dimension | Lemana PRO | Hoff | Ozon | Yandex Market | Wildberries (optional) |
|---|---|---|---|---|---|
| **Product fit (furniture categories)** | MEDIUM | **HIGH** | HIGH | HIGH | HIGH |
| — sofas / armchairs / chairs | LOW-MED | HIGH | HIGH | HIGH | HIGH |
| — coffee/side / dining tables | MED | HIGH | HIGH | HIGH | HIGH |
| — TV units / storage | HIGH | HIGH | HIGH | HIGH | HIGH |
| — lamps / home furnishing | HIGH | HIGH | HIGH | HIGH | HIGH |
| **Official retrieval mechanism** | Marketplace API + B2B API (both approved-only) | Supplier portal + stock sync (IP-allowlist) + EDI | Seller API (`api-seller.ozon.ru`, 410+ methods) | Partner API + Affiliate API (dual family) | Content/Price/Marketplace APIs (seller-only) |
| **Official docs URL** | `developers.lemanapro.ru/partners-started` + `/api_b2b` | `suppliers.hoff.ru` + `prod-vendremains.hoff.ru` (via secondary) | `docs.ozon.ru/api/seller` | `yandex.ru/dev/market/partner-api/doc/ru` + `yandex.ru/dev/market/affiliate/ru` | `dev.wildberries.ru/en` |
| **Intended API user** | Merchant selling *on* Lemana (Marketplace) / Corp buyer *from* Lemana (B2B) | Supplier selling *to* Hoff | Seller selling *on* Ozon | Merchant (Partner) / Affiliate partner (Affiliate) | Seller selling *on* WB |
| **Auth** | `client_id+client_secret -> partners.auth.lemanapro.ru` (client_credentials, 300s) | IP allowlist via `sendstock@hoff.ru` + warehouseId | `Client-Id + Api-Key` headers (POST-only) | Partner: `Api-Key`/`OAuth`; Affiliate: `OAuth/API-Key + clid` | 4 token types: Personal/Service/Base/Test (via `dev.wb.ru`) |
| **Approval needed** | YES — registration + manager review + contract | YES — supplier registration + IP setup + personal cabinet | YES — seller account + API key via `seller.ozon.ru/app/settings/api-keys` | YES — Distribution contract + API-Key; Yandex may refuse without explanation (2.1) | YES — seller account + token via cabinet |
| **Arbitrary consumer catalog search** | NO | NO | NO | **CONDITIONAL** — Affiliate `POST /partner/article/create` returns data for known ID; bulk search via Content API is INFERENCE/UNKNOWN | NO (unofficial `search.wb.ru` exists but not official) |
| **Product lookup by ID** | Own LM-codes only (paginated GET) | Own SKU only (per warehouseId) | Own `offer_id/sku` only | Affiliate: YES by `marketArticle` or `marketUrl` (returns `price+stockAmount+productPhoto`); Partner: own `shopSku` only | Own `nmId/imtId` only (official); unofficial `card.wb.ru/cards/v4/detail?nm=...` is not official |
| **Categories enumeration** | Own assortment categories only | Own assortment only (via PIM) | Own categories via `description_category` | Own via `v2/categories/tree` + `v2/category/{id}/parameters`; affiliate category listing is UNKNOWN | Own via `getParentAll` / `getObjectAll` |
| **Dimensions / specs** | Own (via portal) — must supply; not third-party readable | Own (via portal/PIM) | Own mandatory per-category attributes (`parameterValues`) | Own (required per leaf category + `parameterValues`); affiliate returns `characteristics` via Content API (INFERENCE) | Own `characteristics` per subjectId |
| **Image URLs** | Own upload via portal; not third-party readable | Own via portal | Own upload | Affiliate response includes `productPhoto` for known ID; Partner includes own images | Own media via Content API |
| **Price exposed** | Own price upload (write-only batch; cannot read showcase price via API) | Own price via portal | Own price via `/v1/product/import/prices` (batch 1000) | Affiliate single-product response includes `price` (REQUEST-TIME); Partner via `offer-mappings/update` | Own via `discounts-prices-api` |
| **Stock exposed** | Per `logisticLocationId` (7000001-7999999) read/update, 1-500 SKUs/call | Per `warehouseId` `skus[] -> items[{type,count,updatedAt}]`, 2 cols CSV alternative | Own warehouses via Seller API | Affiliate single-product `stockAmount`; Partner per-warehouse via campaign/business | Per-warehouse via Marketplace API |
| **Region support** | Per-warehouse + region-subdomain (`krasnoyarsk.lemanapro.ru`) | Per-warehouse `warehouseId`, 61 stores / 23 cities | `dest`/geography param + per-warehouse (INFERENCE) | `geoId` + legally required city-precision display (2.8) | `dest` + per-warehouse `offices()` |
| **Rate limit (documented)** | 100 req/min per method (official "Ogranicheniya") | >=2x/day stock sync expectation; no public rate doc | ~60 req/min most methods (secondary citing official) | Affiliate: 5 req/sec + 400k/day (`X-RateLimit-*`); Partner: 4 parallel + 512 KB + resource limits | Content read 100 req/min, mutations 10 req/min, warehouses 300 req/min |
| **Affiliate program** | YES — `partners.lemanapro.ru` + Admitad/Pampadu/GdeSlon; up to 6.5% cat-dependent, 0.1% best-price, 3.08% app | YES — `advcake.ru/lp/hoff` (up to 10.9%), Admitad currently unavailable, Sostav notes 30-day cookie + context forbidden + cashback interception | YES — Ozon Blogger (VK/MAX, zero follower threshold, up to 50% headline, ORD OZON labeling) + Admitad | YES — `aff.market.yandex.ru` (links, informers, API, partner article, chatbot); per-item `tariffRate` (e.g., 0.088 FASHION, 0.081 KIDS) | NO platform program — seller-scoped Catuik only |
| **Affiliate == catalog API?** | NO | NO | NO | **PARTIAL YES** — affiliate API returns data | NO |
| **Data-rights confidence** | REQUIRES CONFIRMATION (no data-license found) | REQUIRES CONFIRMATION (supplier terms only) | REQUIRES CONFIRMATION (seller agreement not fetched) | **Most documented but still** REQUIRES CONFIRMATION for cache/proxy/embeddings; display with attribution ALLOWED under 2.4 | REQUIRES CONFIRMATION |
| **Data-access certainty (0-5)** | 1 | 1 | 1 | **3** | 0 |
| **Commercial fit (0-5)** | 3 | 3 | 3 | 3 | 1 |
| **Catalog fit (0-5)** | 2 | 5 | 4 | 5 | 4 |
| **Operational maintainability (0-5)** | 1 | 1 | 2 | 3 | 1 |
| **Production outlook** | **RED** | **RED** (GREEN for manual benchmark) | **RED** | **YELLOW** (conditional) | **RED** |

---

## Rating legend (per correction)

- **0** — effectively unusable / evidence of no viable path
- **1** — severe blocker
- **2** — major unresolved dependencies
- **3** — plausible with material unknowns
- **4** — credible path with minor unknowns
- **5** — directly documented and realistically usable

Overall outlook:

- **GREEN** — production-viable with minor unknowns.
- **YELLOW** — conditional; credible path but requires commercial/legal confirmations before engineering.
- **RED** — no current production-viable path; manual benchmark only or requires fundamental partnership negotiation.

---

## Key URLs (official where possible)

- Lemana PRO Marketplace API: `https://developers.lemanapro.ru/partners-started/` + `https://developers.lemanapro.ru/api_partners/` + Auth `https://developers.lemanapro.ru/partners-authorization/` + B2B `https://developers.lemanapro.ru/api_b2b/` + Changelog `https://developers.lemanapro.ru/release-notes/` + FAQ `https://developers.lemanapro.ru/faq/` + Affiliate `https://partners.lemanapro.ru/` + Sale rules `https://krasnoyarsk.lemanapro.ru/pravila/`
- Hoff supplier: `https://suppliers.hoff.ru/supplier/legal-documents/terms-of-use` + Stock `https://prod-vendremains.hoff.ru/VendInventoryReader/` (via supplier doc) + Corporate `https://hoff.ru/` (401 on fetch, still official) + HoffTech `https://github.com/HoffTech`
- Ozon seller: `https://docs.ozon.ru/api/seller/` + `https://api-seller.ozon.ru` + Seller keys `https://seller.ozon.ru/app/settings/api-keys`
- Yandex Market partner: `https://yandex.ru/dev/market/partner-api/doc/ru/` + limits `https://yandex.ru/dev/market/partner-api/doc/ru/concepts/limits` + offer-mappings `https://yandex.ru/dev/market/partner-api/doc/ru/reference/business-assortment/getOfferMappings` + affiliate `https://yandex.ru/dev/market/affiliate/ru/` + affiliate limits `https://yandex.ru/dev/market/affiliate/ru/concepts/limits` + partner article `https://yandex.ru/dev/market/affiliate/ru/reference/get-partner-article` + legal `https://yandex.ru/legal/market_affiliate_api/ru` + instruments `https://aff.market.yandex.ru/instruments`
- Wildberries: `https://dev.wildberries.ru/en` + `https://dev.wildberries.ru/en/docs/openapi/api-information`

---

## Inferences explicitly marked UNKNOWN in this matrix

- Whether Lemana internal storefront JSON exists (not documented as public).
- Whether Hoff has an internal storefront JSON usable as public API (likely exists technically, not documented — UNKNOWN).
- Whether Ozon unofficial `search.wb.ru`-style endpoints are production-viable (explicitly NO per brief — not official).
- Whether Yandex Market Content API search is bundled with affiliate Distribution contract (not fetched; listed as conditional).
- Whether WB unofficial `search.wb.ru`/`card.wb.ru`/`basket` CDN endpoints are permitted for third-party use (not official — UNKNOWN/PRESUMED NOT PERMITTED).

---

*Use UNKNOWN rather than guessing. This matrix is a research snapshot, not a contract.*
