# Retail Matching Decision v1

> Track F3 Phase 6 — final decision report for "can InteriorMagic reliably map virtual furniture to
> real purchasable analogues?"
> Inputs: golden-dataset-v1 (42 assets), deterministic baseline, visual rerank simulation/oracle,
> F0 data-access findings, F2 storefront benchmark.

---

## 1. Results summary

| Metric | F2 (storefront, 50 assets) | F3 baseline (golden, 22 w/ positives) | F3 oracle visual ceiling |
|---|---|---|---|
| Top-1 A | 14% | **27%** | 32% |
| Top-1 A+B | 56% | **91%** | 100% |
| Hit@3 A+B | 56% | **100%** | 100% |
| MRR A+B | 0.42 | **0.95** | ~1.0 |
| Dimension-safe Top-1 | 58% (compat Top-3) | **83%** | n/a |
| Category errors | unmeasurable (design) | **0** (gate) | 0 |

Difficulty gradient (baseline): easy 11/11 · medium 5/6 · hard 4/5 Top-1 A+B.
Abstention: 2/20 negative assets produce a high-confidence false top — both silhouette-class errors,
exactly what the visual layer targets (oracle removes both).

## 2. What changed since F2

1. **Retrieval, not matching, was F2's main bottleneck** — targeted retrieval converted three
   hard no-match assets into valid gold positives (corner sofa, bar-height chair, tall wardrobe).
2. **A small deterministic matcher already reaches 91% Top-1 A+B** on verified pools with zero ML:
   category gate + role + axis-order-agnostic dimensions + material hints suffice for ranking;
   strict-A remains capped by silhouette verification.
3. **Text-side signals are exhausted**: the visual-proxy rerank added nothing; oracle shows the
   remaining headroom (+5pp strict-A overall; fixes both false positives) requires real pixels.
4. **Negative gold works**: 20 documented no-match assets measure abstention instead of poisoning
   precision.

## 3. Decision

### CONDITIONAL GO

Matching works for categories where form families are standard and dimensions are published
(easy 100%, medium 83% Top-1 A+B). Production integration remains premature for exactly two
reasons, both external to matching quality:

- **DATA GO is still CONDITIONAL YELLOW** — no retailer grants lawful programmatic catalog access
  yet; Yandex Market outreach questions are drafted but unanswered.
- **Image rights are unresolved for every retailer**, which blocks the only lever that moves
  strict-A metrics (visual reranking).

Neither blocker is solvable by more matching research; both have concrete unblocking paths
(commercial reply; rights clause in distribution agreement).

## 4. Conditions to revisit (exit criteria toward GO)

| # | Condition | Owner |
|---|---|---|
| 1 | Yandex Market confirms Content-API search for non-seller partner + image/embedding rights | Commercial |
| 2 | Human spot-check of ≥30 golden labels confirms researcher-label agreement ≥90% on A/B vs C/X | Product research |
| 3 | Rights-gated SigLIP pilot achieves ≥70% of oracle delta (strict-A ≥30%, false-positive negatives = 0) | Engineering research |
| 4 | `semantic.role` filled + `shape.family` added for benchmark categories (metadata rec v1) | Asset authoring |

If condition 1 fails outright (no lawful path at any retailer) → reclassify to NO-GO for production
ingestion while keeping offline matching research alive.

## 5. Explicit non-goals honored

No scraper, production API, database/vector DB, UI, affiliate integration, catalog-schema change or
runtime modification occurred in this track. All artifacts live under `docs/research/retail/` and
`scripts/research/retail/` (offline Node scripts, no new dependencies).
