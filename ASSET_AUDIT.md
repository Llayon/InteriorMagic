# Trial asset audit

The first visual slice uses one coherent source: Kenney's **Furniture Kit**. The pack is CC0, uses compact embedded PBR material factors, and requires no runtime texture downloads. Measurements below come from the checked-in binary GLBs, inspected before admission to the catalog.

| Asset | `semantic.role` | GLB | Triangles | Primitives | Materials | Textures / max | Est. GPU textures | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Nordic sofa | `sofa` | 8.9 KiB | 116 | 2 | 2 | 0 / — | 0 | Fabric + metal, scale 1.8 |
| Nordic armchair | `armchair` | 8.9 KiB | 116 | 2 | 2 | 0 / — | 0 | Same visual family, scale 1.25 |
| Relax armchair | `armchair` | 13.6 KiB | 188 | 3 | 3 | 0 / — | 0 | Accent seating, scale 1.25 |
| Glass coffee table | `coffeeTable` | 9.2 KiB | 140 | 2 | 2 | 0 / — | 0 | Glass/wood reading, scale 1.8 |
| Drawer side table | `sideTable` | 18.6 KiB | 238 | 6 | 3 | 0 / — | 0 | Trial catalog; omitted from fixture |
| Rounded rug | `rug` | 10.6 KiB | 204 | 2 | 2 | 0 / — | 0 | Non-blocking collision group |
| Round floor lamp | `floorLamp` | 6.4 KiB | 76 | 2 | 2 | 0 / — | 0 | Floor-only placement |
| Tall potted plant | `plant` | 7.4 KiB | 60 | 3 | 3 | 0 / — | 0 | Opaque foliage; no alpha overdraw |
| Leafy plant | `plant` | 12.7 KiB | 158 | 2 | 2 | 0 / — | 0 | Opaque foliage; no alpha overdraw |
| Low open bookcase | `console` | 11.3 KiB | 184 | 1 | 1 | 0 / — | 0 | Floor-standing storage |

## Aggregate

- Trial catalog: **110,236 bytes (107.7 KiB), 1,480 triangles, 25 primitives, 22 material slots, zero texture images**.
- Curated nine-asset room: **91,164 bytes (89.0 KiB)** loaded GLB data; runtime capture reports **33 draw calls and 1,288 visible triangles** including room and editor rendering.
- Texture GPU allocation attributable to the Kenney GLBs: **0 bytes**. The renderer still owns two internal textures for the local PMREM/environment pipeline.
- Files declare `KHR_materials_unlit` in `extensionsUsed`, but selected material records use ordinary metallic/roughness data and do not attach that extension. No custom loader path is required.
- No geometry, texture, Meshopt, Draco or KTX2 preprocessing was applied. Coordinate correction is registry metadata only.

## Stress-test comparison

The existing Sheen Chair is intentionally not representative of the desired catalog average: about **4.13 MiB**, **39,936 triangles**, four primitives, seven 512–1024 px embedded textures, and about **15.4 MiB** estimated decoded texture allocation. A typical new Kenney asset is roughly 6–19 KiB and 60–238 triangles. Sheen remains useful for validating textured PBR and `KHR_materials_sheen`, but is excluded from the curated room because its realism and cost do not match this family.

## Source and license

All ten assets and thumbnails are from [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit), © Kenney, released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Per-file provenance is recorded in `THIRD_PARTY_ASSETS.md`.
