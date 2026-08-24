# Retail Metadata Recommendation v1

> Track F3 Phase 4 — evidence-based metadata recommendations.
> Evidence: golden-dataset-v1 (42 assets) + baseline matcher ablations + F2/F3 failure analysis.
> Principle from ARCHITECTURE.md: production assets receive only semantic metadata required by
> current product behavior. No speculative fields.

---

## What the experiments actually proved

| Signal | Evidence strength | Effect observed |
|---|---|---|
| `category` (existing) | strong | gate-enforced; 0 category errors in baseline; pooled-retrieval caveat documented |
| `dimensions`/`footprint` (existing) | **strongest** | primary separator; 83% dimension-safe Top-1; drives nearly all X/C rejections |
| axis-order ambiguity of retailer dims | new finding | listings mix ШхГхВ / ДxШxВ / В*Ш*Г — matcher had to be order-agnostic; a canonical axis convention on OUR side removes a real error source |
| semantic role (existing, sparse) | medium | `armchair` vs null changed allowed-set behavior for chairs; manifest `Chair N` names carry zero role signal |
| material hints (derived ad hoc) | medium | velvet/glass/oak matches lifted A-rank ties (`chair`, `table`, `glassCoffeeTable`) |
| color/style | weak | tie-break only; never decisive |
| **silhouette class** | **the missing decider** | all strict-A failures below oracle are silhouette-driven; text proxies cannot capture it |

## Recommended fields

### Required now (before any F4 visual pilot)

1. **`semantic.role` completeness** — fill the existing optional field for every seating asset
   (dining-chair vs armchair distinction is already load-bearing in the matcher). No schema change:
   the field exists (`FurnitureAssetDefinition.semantic.role`); it is currently sparse.
2. **`shape.family` (new, tiny enum)** — the one genuinely missing field with direct experimental
   evidence. Values kept minimal: `straight | corner-modular | lounge-low | accent-tall | classic-shade |
   cylinder | arc | rectangular-open | closed-cabinet`. Rationale: 20 hard-tier assets fail on
   silhouette class, and the two false-positive negatives are exactly shape-class errors. This is
   authoring-time metadata on the asset side only; retail side keeps its raw text.
3. **Canonical dimension axes documentation** — not a field but a contract note in ASSET_GUIDE:
   our W/H/D is always (width X, height Y, depth Z) post-normalization; ingest code must map
   retailer strings explicitly and mark uncertain axes instead of guessing.

### Future optional (only after F4 demonstrates need)

- `material.family` enum (velvet/boucle/leather/wood/glass/metal/marble/…) — useful, derivable
  later from `materialOverrides` keys + LLM normalization of retailer attributes; do not block on it.
- `color.family` — variant hexes already encode this implicitly; add only if color reranking earns
  its weight in F4.
- `style.family` — weakest signal measured; defer indefinitely unless UX wants style browsing.
- `usage.context` (e.g., bar-height, banquet) — needed only to explain "compatible dims but wrong
  usage" golds (work_table_005 vs folding tables); can live in match explanations rather than schema.
- `retail.categoryHints` — mapping table asset-category → retailer leaf categories belongs to the
  future Retail Matching domain (per F0 domain-model), NOT on FurnitureAssetDefinition.

## Explicitly NOT recommended now

- Any per-asset retail identifiers or price fields (violates F0 domain separation).
- Embedding/vector fields on assets (visual pipeline owns descriptors; rights still unresolved).
- Mass metadata migration: the 42-asset golden set was labeled successfully with current metadata;
  enrichment should ride along normal asset authoring, starting with the ~8 benchmark assets that
  would gain `semantic.role`.
