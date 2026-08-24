# Yandex Market — Data Access Questions (DRAFT, NOT SENT)

> Track F / F2 appendix. Prepared 2026-08-24. No message has been sent to Yandex.
> Purpose: unblock DATA GO (currently CONDITIONAL YELLOW per `retail-access-feasibility-v1.md`).
> Addressee (when sent): Yandex Market partner/distribution onboarding.

---

Context: InteriorMagic is a room-planning app (Telegram Mini App / web). We match a user's virtual
3D furniture against real purchasable products and need lawful, refreshable product data
(title, dimensions/specifications, image URLs, price, availability) with region-correct presentation.
We are not a seller and do not intend to sell on the Market.

Questions:

1. **Content API availability for non-sellers.** Can a Distribution/Affiliate partner access Content
   API product-search endpoints (keyword search, model/card lookup, category enumeration — e.g.
   `/v2/search`, `/v2/models`, category tree) using an affiliate/distribution credential, without
   holding a seller `businessId`? If yes, under which program and with what limits beyond the
   documented affiliate limits (5 req/sec, 400k/day)?

2. **Permitted data operations under the agreement.** Under the affiliate/distribution agreement,
   may a partner:
   - store product metadata (title, specs, dimensions);
   - cache prices and availability, and for how long (TTL)?
   - proxy/cache product images (vs hot-linking), and at what sizes?
   - generate visual embeddings/derived descriptors from product images for internal matching;
   - retain derived descriptors after a product is delisted;
   - periodically re-index products (recommended cadence)?
   Please cite the governing clauses or point to the relevant addendum. Attribution requirements we
   already understand from the public agreement (logo + "Данные сервиса Яндекс Маркет" hyperlink,
   no modification/re-sorting, city-accurate display).

3. **Recommended integration path for comparison/recommendation apps.** For applications that
   compare or recommend Market products without being sellers, which official mechanism does Yandex
   recommend: Affiliate API only, Content API under distribution contract, partner feed files, or a
   bespoke B2B data agreement?

4. **Region handling requirements.** Beyond the contractual requirement to present location-accurate
   data (city precision): which request parameters (`geoId`/`contentRegion`) must accompany price/
   stock/delivery queries, and is there a sanctioned fallback when a user's city cannot be detected?

Prepared questions only; no commercial commitment expressed or implied in this draft.
