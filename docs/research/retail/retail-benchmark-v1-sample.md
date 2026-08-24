# Retail Benchmark v1 — 50-Asset Sample

> Track F / Phase F2 manual matching benchmark.
> Base: `02342c68a6d9abb54500106f5a4baf3ecac512f4` (`research/retail-matching-v1`).
> Branch: `research/retail-benchmark-v1`. Date: 2026-08-24.
> Researcher labels (proxy ground truth), NOT human ground truth.

---

## Dimension measurement method for ITHappy-manifest assets

The 836-asset manifest carries **no dimensions**. To obtain trustworthy W/H/D for selected manifest
assets without modifying any asset definitions, a throwaway read-only script measured world-space
bounding boxes directly from the local GLB files
(`.agent-data/ithappy-production-pipeline/runtime-assets/*.glb`, POSITION accessor min/max composed
through full node transform hierarchies).

Validation: the script exactly reproduces the six independently recorded values in the BrowserStack
benchmark set (`sofa_037 2.2994x1.0765x1.3572`, `chair_024`, `chair_058`, `coffee_table`, `lamp_048`,
`cupboard_003`). Method error vs known references: 0.0000 m on all axes.

Registry (`src/editor/assets/registry.ts`) dimensions are canonical post-normalization values and are
used verbatim. The script itself is scratch tooling under `.agent-data` and is not committed.

Duplicate geometry noted: `sofa_036 == sofa_045` and `work_table_005 == work_table_007` share identical
bounds; `work_table_002/011/014/016` also cluster at one size. The catalog genuinely contains duplicate
meshes; kept deliberately (tests retrieval robustness), flagged per row.

---

## F2A calibration subset (assets 1-10)

| # | assetId | source | category | role | W | H | D | difficulty | rationale |
|---|---|---|---|---|---|---|---|---|---|
| 1 | sofa | registry | sofas | - | 2.05 | 0.96 | 0.85 | easy | generic rectangular sofa, canonical test |
| 2 | nordicSofa | registry | sofas | sofa | 2.02 | 0.72 | 0.74 | easy | low-profile scandi, tests back-height sensitivity |
| 3 | chair | registry | chairs | armchair | 0.72 | 1.08 | 0.76 | easy | compact upholstered armchair |
| 4 | sheenChair | registry | chairs | armchair | 0.83 | 0.69 | 0.57 | medium | velvet accent, low wide, distinctive |
| 5 | glassCoffeeTable | registry | tables | coffeeTable | 1.19 | 0.41 | 0.72 | medium | transparent glass, low |
| 6 | table | registry | tables | - | 1.35 | 0.76 | 0.78 | easy | standard dining height wood |
| 7 | lowBookcase | registry | tables | console | 0.88 | 0.88 | 0.55 | hard | open console, unusual height class |
| 8 | roundFloorLamp | registry | lamps | floorLamp | 0.29 | 1.63 | 0.33 | easy | slim classic floor lamp |
| 9 | sofa_037 | ithappy | sofas | sofa | 2.30 | 1.08 | 1.36 | hard | extremely deep lounge geometry |
| 10 | chair_024 | ithappy | chairs | armchair | 0.73 | 1.14 | 0.71 | medium | tall wingback-like proportions |

Calibration verdict: retrieval viable (structured RU storefronts expose dims in titles/spec tables);
dimension availability high in supplementary shops, near-zero via Hoff snippets through agent channel;
labels usable; continued to full 50. See results doc for details.

---

## Full sample

Difficulty mix achieved: easy 21 (42%), medium 13 (26%), hard 16 (32%) — target was ~40/40/20;
the ITHappy catalog skews oversized/distinctive, so the hard share is higher than targeted.
Reported honestly; difficult assets were not swapped after seeing results.

| # | assetId | source | category | role | W | H | D | diff | rationale |
|---|---|---|---|---|---|---|---|---|---|
| 1 | sofa | registry | sofas | - | 2.05 | 0.96 | 0.85 | easy | baseline straight sofa |
| 2 | nordicSofa | registry | sofas | sofa | 2.02 | 0.72 | 0.74 | easy | low scandi sofa |
| 3 | sofa_031 | ithappy | sofas | sofa | 2.90 | 1.30 | 1.13 | medium | oversized, tall back |
| 4 | sofa_033 | ithappy | sofas | sofa | 3.95 | 1.26 | 1.29 | hard | extra-long 3.95 m |
| 5 | sofa_036 | ithappy | sofas | sofa | 2.87 | 1.30 | 1.26 | easy | large standard-form sofa |
| 6 | sofa_037 | ithappy | sofas | sofa | 2.30 | 1.08 | 1.36 | hard | ultra-deep lounge |
| 7 | sofa_039 | ithappy | sofas | sofa | 3.93 | 1.09 | 1.37 | hard | extra-long, deep |
| 8 | sofa_040 | ithappy | sofas | sofa | 2.83 | 1.13 | 1.39 | easy | large deep standard form |
| 9 | sofa_042 | ithappy | sofas | sofa | 2.77 | 1.23 | 1.50 | hard | extreme 1.50 m depth |
| 10 | sofa_044 | ithappy | sofas | sofa | 5.20 | 1.12 | 3.07 | hard | bounds suggest modular/corner set |
| 11 | chair | registry | chairs | armchair | 0.72 | 1.08 | 0.76 | easy | compact armchair |
| 12 | sheenChair | registry | chairs | armchair | 0.83 | 0.69 | 0.57 | medium | velvet accent lounge |
| 13 | nordicArmchair | registry | chairs | armchair | 0.91 | 0.50 | 0.51 | hard | ultra-low lounge profile |
| 14 | relaxArmchair | registry | chairs | armchair | 0.61 | 0.79 | 0.84 | easy | compact recliner-form |
| 15 | chair_024 | ithappy | chairs | armchair | 0.73 | 1.14 | 0.71 | medium | tall back |
| 16 | chair_026 | ithappy | chairs | armchair | 0.65 | 1.20 | 0.75 | medium | high-back narrow accent |
| 17 | chair_058 | ithappy | chairs | armchair | 1.14 | 0.62 | 0.47 | hard | double-wide low lounger |
| 18 | chair_066 | ithappy | chairs | armchair | 0.84 | 0.54 | 0.47 | hard | low wide lounge |
| 19 | chair_162 | ithappy | chairs | armchair | 0.64 | 1.25 | 0.61 | medium | tall narrow |
| 20 | chair_041 | ithappy | chairs | armchair | 0.58 | 1.38 | 0.60 | hard | very tall narrow accent |
| 21 | chair_016 | ithappy | chairs | - (dining) | 0.43 | 1.06 | 0.43 | easy | slim upright chair |
| 22 | chair_018 | ithappy | chairs | - (dining) | 0.59 | 1.15 | 0.58 | easy | upright, square seat |
| 23 | chair_019 | ithappy | chairs | - (dining) | 0.56 | 1.03 | 0.56 | easy | upright |
| 24 | chair_021 | ithappy | chairs | - (dining) | 0.53 | 1.15 | 0.53 | easy | slim upright |
| 25 | chair_022 | ithappy | chairs | - (dining) | 0.52 | 1.15 | 0.55 | easy | slim upright |
| 26 | chair_042 | ithappy | chairs | - (dining) | 0.49 | 1.14 | 0.60 | easy | upright |
| 27 | chair_043 | ithappy | chairs | - (dining) | 0.47 | 1.01 | 0.47 | easy | compact upright |
| 28 | chair_027 | ithappy | chairs | - (dining) | 0.70 | 1.23 | 0.76 | medium | wide carver-style |
| 29 | chair_035 | ithappy | chairs | - (dining) | 0.60 | 1.41 | 0.62 | hard | bar-stool-height back |
| 30 | chair_025 | ithappy | chairs | - (dining) | 0.60 | 0.71 | 0.60 | hard | stool-height, low back |
| 31 | glassCoffeeTable | registry | tables | coffeeTable | 1.19 | 0.41 | 0.72 | medium | glass rectangle |
| 32 | drawerSideTable | registry | tables | sideTable | 0.75 | 0.54 | 0.31 | hard | very shallow side table |
| 33 | coffee_table | ithappy | tables | coffeeTable | 1.08 | 0.66 | 1.08 | medium | large square |
| 34 | coffee_table_030 | ithappy | tables | coffeeTable | 1.24 | 0.60 | 1.24 | hard | oversized square |
| 35 | coffee_table_028 | ithappy | tables | coffeeTable | 0.90 | 0.54 | 1.53 | hard | elongated bench-form |
| 36 | table | registry | tables | - (dining) | 1.35 | 0.76 | 0.78 | easy | standard 135 dining |
| 37 | work_table_002 | ithappy | tables | - (dining) | 1.65 | 0.92 | 0.83 | easy | 165 dining/work |
| 38 | work_table_017 | ithappy | tables | - (dining) | 1.85 | 0.92 | 0.82 | medium | long table |
| 39 | work_table_005 | ithappy | tables | - (dining) | 2.09 | 0.98 | 1.26 | hard | banquet depth 1.26 |
| 40 | work_table_007 | ithappy | tables | - (dining) | 2.09 | 0.98 | 1.26 | hard | duplicate geometry of #39 |
| 41 | lowBookcase | registry | tables | console | 0.88 | 0.88 | 0.55 | hard | tall open console |
| 42 | cupboard_022 | ithappy | storage | - | 2.65 | 2.39 | 0.45 | hard | wall-unit scale |
| 43 | dresser_001 | ithappy | storage | - | 2.28 | 0.75 | 0.77 | medium | long low dresser |
| 44 | cupboard_003 | ithappy | storage | - | 1.38 | 2.71 | 0.72 | medium | tall narrow cupboard |
| 45 | dresser | ithappy | storage | - | 0.71 | 0.76 | 0.61 | easy | small chest |
| 46 | lamp | registry | lamps | floorLamp | 0.48 | 1.65 | 0.48 | easy | classic shade torchiere |
| 47 | roundFloorLamp | registry | lamps | floorLamp | 0.29 | 1.63 | 0.33 | easy | slim stem |
| 48 | lamp_028 | ithappy | lamps | floorLamp | 0.38 | 1.74 | 0.38 | easy | tall slim |
| 49 | lamp_036 | ithappy | lamps | floorLamp | 0.78 | 1.98 | 0.58 | hard | oversized arc/tripod form |
| 50 | lamp_048 | ithappy | lamps | floorLamp | 0.51 | 0.79 | 0.61 | hard | table-lamp scale labeled floor |

Notes:
- `role` shown as `-` where the registry entry has no `semantic.role`; dining-chair rows are
  `chairs`-category assets used as dining chairs for this benchmark (catalog has no dining-chair
  distinction yet — itself a finding).
- Manifest thumbnails referenced as `thumbnails/<assetId>.webp` under the local build directory;
  GLBs as `runtime-assets/<assetId>.glb`. Neither committed here.
