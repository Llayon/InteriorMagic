# Production Catalog v1 — Selection Rationale

This report is derived from the canonical runtime manifest and the joined upstream inventory. It is explanatory only; `src/editor/catalog/data/production-catalog-v1.json` remains the single source of truth.

Selected assets: **47**. Every selected row has a verified semantic role and upstream runtime/thumbnail QA status.

| Asset | Source category | Semantic role | Runtime bytes | Runtime policy | Thumbnail | Evidence |
| --- | --- | --- | ---: | --- | --- | --- |
| carpet | carpet | rug | 173560 | PASS | skipped | "sourceCategory carpet; canonical rug" |
| carpet_001 | carpet | rug | 122240 | PASS | skipped | "sourceCategory carpet; canonical rug" |
| carpet_002 | carpet | rug | 149568 | PASS | skipped | "sourceCategory carpet; canonical rug" |
| carpet_003 | carpet | rug | 230468 | PASS | skipped | "sourceCategory carpet; canonical rug" |
| carpet_004 | carpet | rug | 120288 | PASS | skipped | "sourceCategory carpet; canonical rug" |
| chair | chair | armchair | 654096 | PASS | skipped | "sourceCategory chair; canonical armchair" |
| chair_001 | chair | armchair | 8000 | PASS | skipped | "sourceCategory chair; canonical armchair" |
| coffee_table | coffee | coffeeTable | 165912 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_024 | coffee | coffeeTable | 208932 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_025 | coffee | coffeeTable | 90768 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_026 | coffee | coffeeTable | 230008 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_027 | coffee | coffeeTable | 154588 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_028 | coffee | coffeeTable | 9356 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_029 | coffee | coffeeTable | 229340 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_030 | coffee | coffeeTable | 12444 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_031 | coffee | coffeeTable | 209732 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| coffee_table_032 | coffee | coffeeTable | 215008 | PASS | skipped | "sourceCategory coffee; canonical coffee table" |
| cupboard | cupboard | console | 160268 | PASS | skipped | "sourceCategory cupboard; canonical console" |
| cupboard_001 | cupboard | console | 158528 | PASS | skipped | "sourceCategory cupboard; canonical console" |
| cupboard_002 | cupboard | console | 307496 | PASS | skipped | "sourceCategory cupboard; canonical console" |
| cupboard_003 | cupboard | console | 146032 | PASS | skipped | "sourceCategory cupboard; canonical console" |
| cupboard_004 | cupboard | console | 234104 | PASS | skipped | "sourceCategory cupboard; canonical console" |
| dresser | dresser | console | 13664 | PASS | skipped | "sourceCategory dresser; storage/console" |
| dresser_001 | dresser | console | 236988 | PASS | skipped | "sourceCategory dresser; storage/console" |
| dresser_002 | dresser | console | 428704 | PASS | skipped | "sourceCategory dresser; storage/console" |
| electronics | electronics | tv | 6892 | PASS | skipped | "direct vision: flat-screen TV on white surface" |
| electronics_032 | electronics | tv | 34228 | PASS | skipped | "direct vision: TV (per script)" |
| electronics_036 | electronics | tv | 125156 | PASS | skipped | "direct vision: TV (per script)" |
| electronics_037 | electronics | tv | 121852 | PASS | skipped | "direct vision: TV (per script)" |
| electronics_040 | electronics | tv | 118040 | PASS | skipped | "direct vision: TV with stand (per script)" |
| electronics_046 | electronics | tv | 26344 | PASS | skipped | "direct vision: monitor/TV-style display" |
| electronics_049 | electronics | tv | 9352 | PASS | skipped | "direct vision: TV with stand/legs" |
| flower_038 | flower | plant | 19556 | PASS | skipped | "sourceCategory flower; canonical plant" |
| flower_039 | flower | plant | 36076 | PASS | skipped | "sourceCategory flower; canonical plant" |
| flower_040 | flower | plant | 89632 | PASS | skipped | "sourceCategory flower; canonical plant" |
| flower_041 | flower | plant | 40352 | PASS | skipped | "sourceCategory flower; canonical plant" |
| lamp | lamp | floorLamp | 211400 | PASS | skipped | "sourceCategory lamp; canonical floor lamp" |
| lamp_027 | lamp | floorLamp | 24496 | PASS | skipped | "sourceCategory lamp; canonical floor lamp" |
| lamp_028 | lamp | floorLamp | 110876 | PASS | skipped | "sourceCategory lamp; canonical floor lamp" |
| sofa | sofa | sofa | 58020 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_026 | sofa | sofa | 205892 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_027 | sofa | sofa | 264896 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_028 | sofa | sofa | 20304 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_029 | sofa | sofa | 24876 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_030 | sofa | sofa | 212488 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_031 | sofa | sofa | 7592 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |
| sofa_032 | sofa | sofa | 640372 | PASS | skipped | "sourceCategory sofa; canonical lounge sofa" |

## Rejected or low-confidence evidence

The following rows are not selected because the visual pass rejected them or marked them low-confidence. Source category alone is never sufficient for production semantics.

- `electronics_033`: "direct vision: kitchen appliance; not living-room furniture"
- `electronics_034`: "direct vision: water filter; not living-room furniture"
- `electronics_039`: "direct vision: toaster; not living-room furniture"
- `electronics_035`: "sourceCategory electronics but visually not a TV"
- `electronics_038`: "sourceCategory electronics but visually not a TV"
- `electronics_041`: "sourceCategory electronics but visually not a TV"
- `electronics_042`: "sourceCategory electronics but visually not a TV"
- `electronics_043`: "sourceCategory electronics but visually not a TV"
- `electronics_044`: "sourceCategory electronics but visually not a TV"
- `electronics_045`: "sourceCategory electronics but visually not a TV"
- `electronics_048`: "sourceCategory electronics but visually not a TV"
- `electronics_053`: "sourceCategory electronics but visually not a TV"
- `entertainment`: "direct vision: dartboard; not living-room Alpha"
- `entertainment_034`: "direct vision: speaker"
- `entertainment_032`: "direct vision: foam pad"
- `entertainment_011`: "sourceCategory entertainment; not a TV"
- `entertainment_025`: "sourceCategory entertainment; not a TV"
- `entertainment_031`: "sourceCategory entertainment; not a TV"
- `entertainment_033`: "sourceCategory entertainment; not a TV"
- `entertainment_035`: "sourceCategory entertainment; not a TV"
- `entertainment_036`: "sourceCategory entertainment; not a TV"
- `entertainment_037`: "sourceCategory entertainment; not a TV"
- `entertainment_038`: "sourceCategory entertainment; not a TV"
- `entertainment_039`: "sourceCategory entertainment; not a TV"
- `entertainment_040`: "sourceCategory entertainment; not a TV"
- `entertainment_041`: "sourceCategory entertainment; not a TV"
- `entertainment_042`: "sourceCategory entertainment; not a TV"
- `entertainment_043`: "sourceCategory entertainment; not a TV"
- `entertainment_044`: "sourceCategory entertainment; not a TV"
- `entertainment_045`: "sourceCategory entertainment; not a TV"
- `entertainment_046`: "sourceCategory entertainment; not a TV"
- `entertainment_047`: "sourceCategory entertainment; not a TV"

See `visual-curation-first-pass.csv`, `i2.5-per-asset-exclusions.csv`, and `production-catalog-v1-inventory.csv` for full evidence and upstream facts.
