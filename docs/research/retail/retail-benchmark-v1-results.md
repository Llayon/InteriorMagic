# Retail Benchmark v1 — Results

> Track F / Phase F2 manual matching benchmark (researcher labels, proxy ground truth).
> Base `02342c6` | Branch `research/retail-benchmark-v1` | Date 2026-08-24.
> Sample definition: `retail-benchmark-v1-sample.md`. Raw rows: `retail-benchmark-v1-candidates.csv`.

---

## 1. Executive summary

Across 50 InteriorMagic assets and 150 labeled Top-3 candidates drawn from real Russian storefronts,
**strong-substitute coverage concentrates almost entirely in common-form furniture**: on `easy`
assets Top-1 A-or-B reaches **18/19 (95%)**, while `hard` assets collapse to **3/20 (15%)** and
`medium` to **7/11**. Strict Top-1 A is **7/50 (14%)**, far below the 70% Matching-GO gate.

Three causes dominate, in order of impact:

1. **Visual/silhouette evidence was unavailable to this reviewer.** Labels had to be assigned from
   titles, spec tables, and material descriptions only. Per labeling policy, candidates could not be
   labeled `A` unless the textual description named the same explicit form family *and* dimensions
   were tight; otherwise they were capped at `B`. A human comparing photographs would plausibly
   upgrade many `B` rows. This alone suppresses strict-A metrics and is an artifact of agent review,
   not of the market.
2. **The three mandated retailers were nearly unretrievable through permitted channels.** Direct
   fetches to `hoff.ru` return HTTP 401 (anti-bot); search-index snippets for Hoff surface mostly
   assembly-instruction PDFs, not product specs; Yandex Market surfaces category/filter JSON blobs;
   Wildberries product data did not surface at all. Of 150 retained candidates only **2 come from
   Yandex Market and 0 from Hoff or Wildberries**. The candidate pool therefore comes from other
   public Russian furniture e-shops (divan.ru, kalibroom.ru, inmyroom.ru, stolline.ru,
   steklostol.ru, good-mebel.com, lifemebel.ru and several single-product shops), which expose
   dimensions/prices directly in page text. This is recorded as a **deviation from the brief's
   retailer priority**: the substitution was necessary to test anything at all, and it converts part
   of the per-retailer comparison into a finding about channel access instead of assortment quality.
   Crucially, Hoff's failure here reflects *this agent's access path*, not proof that a human with a
   browser cannot browse Hoff — see limitations.
3. **ITHappy-sourced assets skew oversized/distinctive.** The manifest selection produced many
   geometries with no mass-market analogue (3.9 m sofas, 1.5 m-deep banquet tables, 0.79 m "floor"
   lamps). These are genuine negative evidence and were kept.

Bottom line: the product thesis survives for common furniture where dimensions are published — but
F2 as executed cannot certify match quality for distinctive forms or visually-driven decisions, and
the mandated-retailer channel question remains the binding constraint (DATA GO unchanged).

---

## 2. F2A calibration result (first 10 assets)

| Check | Result |
|---|---|
| Candidate retrieval practically possible | YES — structured RU shops publish dims/prices in text; pooled retrieval worked |
| Retailer pages expose enough dimensions | MIXED — yes via supplementary shops (92% of Top-3 rows have width); near-zero via Hoff snippets; Market/WB unusable |
| A/B/C/X labels usable | YES — with an explicit policy cap: no image inspection ⇒ A only when dims tight AND form family stated in text |
| Review time reasonable | ~2–4 min/asset agent-side (pooled per-category searches); human estimate 5–10 min |
| Dimension normalization workable | YES — raw strings kept separately; ШхГхВ / ДxШxВ / В*Ш*Г conventions mapped; ambiguous orders marked uncertain |
| Category taxonomy mappable | YES with strain — catalog lacks dining-chair vs armchair split; ITHappy `Chair N` names carry zero semantics |

Major blocker requiring STOP: **none** — continued to full 50 under the documented deviation.

---

## 3. Methodology

- Region baseline: **Moscow** for every candidate; queries phrased "купить в Москве".
- Retrieval: per-category manual web searches (no scraping, no internal endpoints, no bulk
  downloads). Queries used normalized attributes (`диван прямой 200 велюр`, `стул обеденный размеры`,
  `тумба под телевизор ширина высота глубина`, `торшер напольный высота`). Search-query log kept in
  scratch. Category hard gate applied when building pools.
- Pools shared across same-category assets; ranking per asset by computed dimension error, then by
  textual form/material fit. Up to Top-10 conceptually; **only Top-3 retained** per brief's
  cost-saving option, plus none-found placeholders where the pool had no plausible item.
- Dimensions: raw retailer string preserved verbatim in `raw_dimensions`; normalized meters in
  separate columns; UNKNOWN never guessed (a candidate without width cannot prove compatibility).
- `dimension_error` = mean relative error over known axes, `Σ|c−a|/a ÷ k`.
- Tolerance derivation (chosen after inspecting pool spread, before final labeling):
  `dimension_compatible = TRUE` iff mean relative error ≤ **0.20** (all categories except floor lamps)
  or ≤ **0.30** (lamps — silhouette dominated by height; retail lamp widths legitimately span
  0.2–1.0 m). No single-axis rule was needed beyond the mean; these are research descriptors, not
  production thresholds.
- Label policy (researcher labels, price/retailer/popularity ignored):
  - `A` requires correct class + compatible dims + explicit textual form-family match;
  - `B` similar class/dims but noticeably off OR form unverified (the default cap for
    text-only review);
  - `C` category-level only;
  - `X` wrong class/grossly incompatible/no plausible candidate exists.
- Terminology: all labels are **researcher labels (proxy ground truth)**; no human reviewed them.

---

## 4. Metrics definitions

- Precision@1 (`Top1A`): share of assets whose rank-1 label is A. `Top1AB` adds B.
- Hit@3: share of assets whose Top-3 contains ≥1 A (`Hit3A`) / ≥1 A-or-B (`Hit3AB`).
- MRR over first A (`MRR_A`), first A-or-B (`MRR_AB`).
- Coverage ≡ Hit@3 here because only Top-3 was retained (documented consequence of the
  Top-K cost option).
- Dimension-compatible Top-3: ≥1 of Top-3 satisfies the tolerance above.
- Error decomposition counts X/C causes qualitatively (see §7).
- Effort: **researcher handling-time proxy** — wall-clock around batched searches; NOT equivalent to
  a controlled human stopwatch benchmark.

---

## 5. Global results (n = 50)

| Metric | Value | GO gate | Pass |
|---|---|---|---|
| Top-1 A | **7 (14%)** | ≥70% | NO |
| Top-1 A-or-B | **28 (56%)** | — | — |
| Hit@3 contains A | **7 (14%)** | ≥90% | NO |
| Hit@3 contains A-or-B | **28 (56%)** | — | — |
| MRR_A | **0.14** | — | — |
| MRR_AB | **0.42** | — | — |
| Dimension-compatible Top-3 | **29/50 (58%)** | ≥85% | NO |
| Coverage (≡Hit@3) | 14% / 56% | ≥80% | NO |
| Researcher handling proxy | ~2–4 min/asset | <2 min human | see caveat |

Label distribution across 150 Top-3 rows: A 11 · B 62 · C 51 · X 26.
Dimension evidence present in 138/150 (92%) of Top-3 rows.

---

## 6. Breakdowns

### 6.1 Per category (asset-level)

| Category | n | Top-1 A | Top-1 AB | Hit@3 AB | Dim-compat T3 |
|---|---|---|---|---|---|
| chairs (armchairs+dining, catalog merges them) | 20 | 1 | 12 | 12 | 14 |
| sofas | 10 | 2 | 7 | 7 | 6 |
| tables (coffee+dining+console) | 11 | 2 | 4 | 4 | 4 |
| storage | 4 | 1 | 2 | 2 | 2 |
| lamps | 5 | 1 | 3 | 3 | 3 |

Best category: **easy seating/dining tables** — classic forms with published dims match well
(dining table asset hit exact-oak 140×80×78 analogues; classic shade floor lamps hit tripod/shade
forms within 4–14% mean error).
Worst: **hard oversized/distinctive ITHappy forms** — 3.9 m and modular sofas, 2.65 m wall units,
banquet depths, bar-height chairs, sub-1 m "floor" lamps have no mass-market counterpart.

### 6.2 By difficulty

| Difficulty | n | Top-1 A | Top-1 A-or-B |
|---|---|---|---|
| easy | 19 | 5 (26%) | **18 (95%)** |
| medium | 11 | 2 (18%) | 7 (64%) |
| hard | 20 | 0 | 3 (15%) |

This gradient is the single most informative F2 result.

### 6.3 Per retailer (candidate rows)

| Source | Rows | A | A-or-B | Width available |
|---|---|---|---|---|
| divan.ru | 54 | 1 | 32 | 54/54 |
| kalibroom.ru | 27 | 3 | 16 | 26/27 |
| inmyroom.ru | 17 | 2 | 9 | 17/17 |
| stolline.ru | 10 | 0 | 0 | 10/10 |
| steklostol.ru | 9 | 1 | 2 | 9/9 |
| bestmebelik / giulianovars / good-mebel / lifemebel / others | 19 | 4 | 12 | 19/19 |
| market.yandex.ru | 2 | 0 | 2 | 2/2 |
| hoff.ru | **0** | 0 | 0 | — |
| wildberries.ru | **0** | 0 | 0 | — |

Hoff/Yandex/Wildberries contributed essentially nothing through permitted automated channels
(401 anti-bot / filter-blob pages / no indexed product evidence). Best substitute sources in this
run: **divan.ru and kalibroom.ru** (furniture-native, dimension-rich snippets).

---

## 7. Error decomposition and negative evidence

Of 26 X-labeled Top-3 rows, causes:

- ~20 dimension-class absence (asset outside manufactured size classes: extra-long/deep sofas,
  banquet tables, oversized arcs, sub-meter "floor" lamps);
- ~6 form absence (modular/corner sofa, ultra-low loungers, tall-narrow accents, sleeper-chair mismatch).

Assets with **zero acceptable (A/B) candidates: 22/50**. Dominant reasons, in order: (1) ITHappy
geometry outside market size classes; (2) silhouette-critical assets unverifiable from text;
(3) pool scope limits for one asset class (wardrobes were added mid-run once the gap was noticed —
that addition upgraded `cupboard_003` from X to A/B and is flagged as a methodology correction, not
cherry-picking: the wardrobe search was triggered by the no-match, and its result is reported as-is).

Difficult/no-match assets were **not replaced** after results (work_table_007 duplicates _005 by
design; both kept failing identically).

---

## 8. Signal importance observations (for F3 design)

- **Dimensions are the strongest usable signal** in text-only conditions: they separated plausible
  from implausible candidates cleanly wherever retailers publish them (92% availability here via
  supplementary shops).
- **Silhouette/visual is the binding missing signal**: it is exactly what caps B→A upgrades. Any F3
  matcher investment only makes sense with multi-view renders vs retail images.
- Material/color/style from text helped tie-break within tolerance (velvet/oak/glass matches noted)
  but never overrode dimensions.
- Category gate could not be measured honestly in this pooled design (pools were built
  category-pure ⇒ category_match=1 by construction). Cross-category leakage testing needs a
  different protocol in F3.
- Metadata sufficiency: existing `category+dimensions+thumbnail+semantic.role` carried the
  benchmark. The one proven gap is semantic: `Chair N`-style manifest names carry no
  armchair-vs-dining-chair signal — a lightweight role tag (or the planned `materialFamily`)
  would help retrieval, but is **not** justified before a visual-capable pass.

---

## 9. Operational observations

- Dead-link rate: 0 confirmed dead — but with the caveat that agent-side URL verification was
  impossible for Hoff (401) and URLs were captured from a same-day live search index; treat link
  health as unverified, not healthy.
- Out-of-stock: 0 explicit OOS encountered; most listings showed prices/stock badges ("Много",
  "В наличии", variant pickers). Not a meaningful measurement this round.
- Regional availability: single-region design (Moscow); delivery-to-Moscow statements observed on
  divan.ru/kalibroom. Regional deltas unmeasured (per brief, matching quality first).
- Researcher handling-time proxy ≈2–4 min/asset (pooled searches amortize cost; a human browsing
  independently should budget 5–10 min/asset). The <2 min GO criterion is **not** evaluated against
  agent latency.

---

## 10. MATCHING GO decision

**CONDITIONAL — quality gates fail as executed (Top-1 A 14% << 70%), and the report deliberately
does not declare mechanical NO-GO** because two structural artifacts suppress the numbers:

1. text-only labeling caps A-rate by policy (no images);
2. the mandated retailer trio yielded ~1% of candidates through permitted channels.

Evidence the thesis itself is sound: easy-tier Top-1 A-or-B 95%, dining-table and classic-lamp
assets reaching strict A with near-zero dimension error, and dimension availability >90% on
dimension-publishing shops. What fails is not "matching is impossible" but "matching cannot yet be
verified end-to-end by an agent, and the primary retail channels are closed to automated access".

## 11. DATA GO status

**CONDITIONAL YELLOW — unchanged from F0.** Storefront availability does not convert any retailer
into a production data source. The F2 channel failures (Hoff 401, Market blobs, WB silence)
reinforce, rather than resolve, the F0 conclusion. Commercial/legal questions remain in
`retail-yandex-data-access-questions-v1.md` (draft only; nothing sent).

## 12. Recommendation for F3

**B — MATCHING IS PROMISING BUT RETRIEVAL/LABELING NEEDS ANOTHER MANUAL PASS.**

Concretely, before any automation decision:

1. Re-run a 20–30 asset subset with a human-in-the-browser on Hoff/divan.ru/kalibroom with
   screenshots, upgrading this benchmark's B-caps to true A/B judgments and validating the 0.20/0.30
   tolerances.
2. Resolve the Yandex Market Content-API question commercially (it would simultaneously fix
   retrieval breadth and enable programmatic dimension feeds).
3. Only then decide on F3 automation (embeddings/multi-view), prioritizing easy/medium categories
   where the thesis already holds.

---

## 13. Limitations (explicit)

- Researcher labels ≠ human ground truth; no inter-rater check was possible.
- Silhouette/material/color/style columns derive from product text, not imagery.
- Pool-based retrieval shares candidates within a category; per-asset independence is partial.
- Category-error rate is unmeasurable in this design (see §8).
- Single region (Moscow); prices are point-in-time observations from snippets/pages on 2026-08-24
  and were NOT used in labeling.
