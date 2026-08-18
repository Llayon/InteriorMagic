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

The development overlay reports actual renderer FPS/frame time, calls, triangles, texture/geometry memory counters, DPR, selection and cache bytes. It updates HTML independently and does not keep WebGL awake while idle.

## Profiling method

- Fill a representative room, then read `renderer.info` after camera movement settles.
- Use Chrome Android remote debugging and Safari Web Inspector for frame time, long tasks and memory.
- Repeat add/delete/variant cycles to detect retained instance-only materials.
- Verify 360×800, 390×844, 430×932 and desktop layouts.
- Confirm category browsing requests thumbnails only; GLB network requests begin on selection or project restore.

The current environment served every GLB and thumbnail with correct MIME types and passed binary parse/normalization tests. A real mobile WebView capture remains required because no browser backend was available during this run.
