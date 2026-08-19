# Third-party assets

## Sheen Chair

- File: `public/models/sheen_chair.glb`
- Thumbnail: `public/thumbnails/sheen_chair.jpg`
- Model: **Sheen Chair**
- Artist: Eric Chadwick
- Owner: Wayfair, LLC
- Source: [KhronosGroup glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair)
- License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
- Retrieved: 2026-08-19

The upstream model files and screenshot are dedicated to the public domain under CC0-1.0. The repository documentation metadata is CC-BY-4.0 and was used only to record the source information above.

The runtime file is intentionally kept unoptimized for the first external-asset audit. It uses embedded PNG textures and `KHR_materials_sheen`, `KHR_materials_variants`, and `KHR_texture_transform`. Compression changes are deferred until a representative asset set exists.

## Kenney Furniture Kit

- Asset pack: **Furniture Kit**
- Author/owner: Kenney
- Source: [official asset page](https://kenney.nl/assets/furniture-kit)
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
- Retrieved: 2026-08-19
- Local license: `public/models/kenney/LICENSE.txt`

The checked-in trial subset contains `loungeDesignSofa`, `loungeDesignChair`, `loungeChairRelax`, `tableCoffeeGlass`, `sideTableDrawers`, `rugRounded`, `lampRoundFloor`, `pottedPlant`, `plantSmall2`, and `bookcaseOpenLow`. Their GLBs live under `public/models/kenney/`; matching official isometric previews are under `public/thumbnails/kenney/`.

Modifications are limited to selecting this subset and applying scale, floor recentering and canonical pivot normalization through AssetRegistry metadata. Binary geometry/material data and thumbnails are otherwise unchanged. See `ASSET_AUDIT.md` for per-file measurements.
