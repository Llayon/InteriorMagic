# Golden Matching Dataset v1

> Track F3 Phase 1. Researcher labels (proxy ground truth) — no human review yet.
> Base: `e043f07` (F2 benchmark head). Branch: `research/retail-matching-intelligence-v1`.
> Machine-readable: `golden-matching-v1.json` (validated JSON, 42 assets).

---

## Purpose

An evaluation corpus **independent of any future matcher**, so baseline and reranking experiments can
be reproduced and compared without touching production code or re-doing storefront research.

## Composition

| Property | Value |
|---|---|
| Assets | **42** (min required: 30) |
| — hard | 20 (all 20 hard assets from F2 sample; prioritized per brief) |
| — medium | 10 |
| — easy | 12 |
| Accepted matches (gold A/B) | **38** across 22 assets |
| Rejected examples (gold C + distractors) | **80** |
| Region | Moscow baseline for every candidate |
| Sources | divan.ru, kalibroom.ru, inmyroom.ru, stolline.ru, steklostol.ru, good-mebel.com, bestmebelshop.ru, shkaf-kupe.ru, skladnoystol.com, proffbar.ru, lifemebel.ru, giulianovars, pushe.ru, stokdivanov.ru, divano.ru, dimobile.md, tk-konstruktor.ru, 3000k.ru, maytoni.am, market.yandex.ru snippets |

## Grades and reasons

- **A** strong analogue — customer could buy instead of the virtual asset.
- **B** acceptable substitute — same class, noticeably different detail.
- **C** not suitable (lives under `rejectedExamples`).
- Reasons restricted to the enum: dimension mismatch · wrong category · wrong silhouette ·
  wrong material · wrong style · wrong usage.

## Integrity rules honored

1. **No invented matches.** Every accepted/rejected entry carries a real retailer URL observed via
   websearch/webfetch on 2026-08-24 (F2 evidence reused where applicable; new targeted retrieval for
   previously-failing classes).
2. **Difficult-first.** All 20 F2-hard assets included; new retrieval was run specifically against
   the classes where F2 found nothing (corner/modular sofas, bar-height chairs, banquet-depth
   tables, tall wardrobes).
3. **F2 distinction preserved.** Each asset keeps its F2 `difficulty` and `f2Top1` label for
   before/after comparison.
4. **Negative gold is explicit.** 20 of 42 assets have empty `acceptedMatches` with reasoned
   rejects; these measure abstention quality, not just precision.
5. Reference renders are pointers to local thumbnails/GLBs (`.agent-data` build artifacts);
   nothing binary is committed.

## Notable gold decisions (changed vs F2)

| Asset | F2 | Gold now | Why |
|---|---|---|---|
| sofa_044 (5.2m modular bounds) | X | **B** ×2 | corner-sofa class exists (Атланта 400×200×82, Ламас 300×170×74) — F2 pool gap fixed by new retrieval |
| chair_035 (H=1.41) | X | **B** | барный стул Ворман 62×60×114 — tall narrow seat-with-back class exists; usage context differs (bar vs dining), kept as B with caveat |
| cupboard_022 (2.65×2.39) | C rank1 | **B** | configurable шкаф-купе Борден-4-4 covers dims (made-to-order caveat) |
| lamp_048 (H=0.79 "floor") | X | stays negative | table-lamp scale labeled floorLamp → correct matcher behavior is abstention (wrong usage) |
| work_table_005/007 (D=1.26) | C | stays negative | home-market max depth ~1.0–1.1 m; folding banquet tables are a different usage class even when W matches |

These four upgrades are exactly the kind of signal F3 needed: F2 failures were partly *retrieval*
failures, not only matching failures.

## Known limitations

- Labels are researcher-generated from text evidence (no image inspection); silhouette/material
  fields are textual proxies.
- Candidate pools per asset are small (3–5 graded items): metrics measure ranking within retrieved
  pools, not open-web recall.
- One methodology correction is embedded in history: wardrobe sources were added after the first
  no-match on cupboard_003-class assets (documented in F2 results §7); the upgraded result stands.
