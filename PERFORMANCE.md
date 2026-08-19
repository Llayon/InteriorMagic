# Performance

## Budgets

- DPR: low 1.0, medium 1.25, high 1.5; hard maximum 1.5.
- Visible triangles: target about 100k, soft limit 150k.
- Draw calls: target below 60, acceptable below 100.
- Textures: usually 512 px, at most 1024 px without measured justification.
- No physics, post-processing, realtime GI or realtime shadows.
- `frameloop="demand"`; pointer movement does not update React/Zustand.

## Current fixtures

Five GLB files total 55,000 bytes (53.7 KiB): sofa 9.6 KiB, chair 10.9 KiB, table 9.1 KiB, plant 21.9 KiB and rug 2.2 KiB. They use embedded colors and no textures. Their combined visual geometry is well below 1k triangles and roughly 22 mesh draws before room/selection overlays.

The first external audit asset, Sheen Chair, is deliberately unoptimized: 4.13 MB GLB, 39,936 triangles, four mesh primitives and seven embedded PNG textures. Texture resolutions are 512–1024 px; glTF Transform estimates roughly 15.4 MB minimum texture GPU allocation. These numbers establish a real baseline and are not yet a reason to introduce Meshopt/KTX2 for the whole pipeline.

The development overlay, also available explicitly with `?debug=1`, reports actual renderer FPS/frame time, calls, triangles, texture/geometry memory counters, DPR, selection and cache bytes. It updates HTML independently and does not keep WebGL awake while idle.

## First Beautiful Room baseline

The CC0 Kenney trial catalog adds ten production assets totaling 107.7 KiB, 1,480 triangles and 25 primitives. The curated room loads nine of them (89.0 KiB). Headed Chromium captures at 390×844, 430×932 and 1440×900 consistently reported:

- DPR 1.5;
- 33 renderer calls;
- 1,288 visible triangles;
- 44 geometries and two renderer textures;
- nine cached assets / 91,164 loaded GLB bytes;
- demand rendering at idle.

The Kenney assets contain no texture images, so their decoded GPU texture allocation is zero. The two renderer textures belong to the local PMREM/environment baseline. Detailed per-asset measurements and the Sheen Chair comparison are in `ASSET_AUDIT.md`.

## Profiling method

- Fill a representative room, then read `renderer.info` after camera movement settles.
- Use Chrome Android remote debugging and Safari Web Inspector for frame time, long tasks and memory.
- Repeat add/delete/variant cycles to detect retained instance-only materials.
- Verify 360×800, 390×844, 430×932 and desktop layouts.
- Confirm category browsing requests thumbnails only; GLB network requests begin on selection or project restore.

The current environment served every GLB and thumbnail with correct MIME types and passed binary parse/normalization tests. A real mobile WebView capture remains required because no browser backend was available during this run.
