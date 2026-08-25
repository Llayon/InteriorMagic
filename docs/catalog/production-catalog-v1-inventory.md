# Production Catalog v1 — Inventory

**Source pipeline:** ITHappy (836 candidates).  
**Upstream policy:** asset-policy.json version `1`, pipelineVersion `1.0.0`.  
**Producer hard cap:** maxTextureDimension: 512 (per asset-policy.json default).  

## Candidate total

**836** ITHappy entries (join of runtime-catalog ∩ catalog-payload ∩ production_inventory ∩ runtime_policy_validation ∩ geometry_invariance ∩ gltf_validation ∩ thumbnail_inventory).

## By displayCategory

| displayCategory | count |
| --- | --- |
| Decor | 231 |
| Architecture | 186 |
| Kitchen & Bath | 127 |
| Storage | 107 |
| Seating | 86 |
| Tables | 38 |
| Bedroom | 23 |
| Plants | 19 |
| Lighting | 19 |
| Total | 836 |

## By sourceCategory

| sourceCategory | count |
| --- | --- |
| prop | 91 |
| kitchen | 89 |
| wall | 67 |
| chair | 59 |
| floor | 41 |
| bathroom | 38 |
| dresser | 35 |
| door | 34 |
| cupboard | 31 |
| picture | 30 |
| curtain | 29 |
| sofa | 27 |
| electronics | 25 |
| window | 24 |
| bed | 23 |
| shelf | 21 |
| entertainment | 20 |
| training | 20 |
| wallpaper | 20 |
| coffee | 19 |
| flower | 19 |
| ladder | 19 |
| lamp | 19 |
| work | 19 |
| carpet | 17 |
| Total | 836 |

## Runtime metric distributions

| metric | min | p50 | p75 | p90 | p99 | max | n | unit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| runtimeBytes | 1944 | 93836 | 222608 | 260600 | 653392 | 862604 | 836 | bytes |
| triangleCount | 2 | 224 | 480 | 924 | 2450 | 7046 | 836 | tris |
| materialCount | 1 | 2 | 3 | 4 | 7 | 8 | 836 | materials |
| textureCount | 0 | 2 | 3 | 3 | 6 | 9 | 836 | textures |
| analyticalDecodedRGBABytes | 0 | 2097152 | 3145728 | 3145728 | 6291456 | 9437184 | 836 | bytes |

## TV coverage

Zero entries with `sourceCategory === "tv"` in upstream ITHappy manifest on origin/main. Visual pass over `electronics`/`entertainment` sourceCategories is mandatory before claiming TV absence — see `docs/catalog/visual-curation.csv`.

## Reference-only assets (not in Production Pack)

Existing in-repo hand-curated entries in `src/editor/assets/registry.ts` (17):

- 6 prototype SVG-stub entries (`sofa`, `chair`, `table`, `plant`, `rug`, `lamp` — last one has no `modelUrl`) — provenance unknown, excluded per project reset.
- 10 Kenney trial entries (`nordicSofa`, `nordicArmchair`, `relaxArmchair`, `glassCoffeeTable`, `drawerSideTable`, `roundedRug`, `roundFloorLamp`, `tallPottedPlant`, `leafyPlant`, `lowBookcase`) — CC0 documented in `THIRD_PARTY_ASSETS.md`, tagged `trial`, NOT in Production Pack.
- 1 sheen entry (`sheenChair`) — CC0 KhronosGroup, exceeds runtime policy (4.13 MiB / 39,936 tri), kept as textured-PBR fixture only.

## Upstream artifact paths (read-only)

- `ithappy-production-pipeline/manifests/runtime-catalog.json`
- `ithappy-production-pipeline/config/asset-policy.json`
- `ithappy-production-pipeline/reports/runtime_policy_validation.csv`
- `ithappy-production-pipeline/reports/production_inventory.csv`
- `ithappy-production-pipeline/reports/geometry_invariance.csv`
- `ithappy-production-pipeline/reports/gltf_validation.csv`
- `ithappy-catalog-build/manifests/catalog-payload.json`
- `ithappy-catalog-build/reports/thumbnail_inventory.csv`

Resolved via scripts/catalog/resolve-ithappy-root.mjs (mirrors scripts/ithappy-local-staging.mjs exactly).
