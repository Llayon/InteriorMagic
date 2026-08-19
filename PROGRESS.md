# Progress

## 2026-08-19 — Playwright browser QA

### Completed

- Добавлены Playwright Chromium, автоматический Vite test server и проекты 390×844, 430×932, 1440×900.
- Покрыты startup, Telegram mock, внешний GLB, request race, proxy selection, edge drag/grabOffset, collision masks, wall snap, history, persistence и responsive layout.
- Добавлен production-gated read-only diagnostics API и контроль console/page/network failures.
- Pages deployment теперь зависит от green quality и E2E jobs; failure artifacts сохраняются Actions.
- Browser run обнаружил и исправил intrinsic grid overflow на viewport 390 px.

### Architecture decisions

- Test API предоставляет только snapshots и screen projection; пользовательские операции проходят через UI/canvas.
- Chromium — единственный blocking browser на этом этапе, CI использует один worker для устойчивого WebGL.
- Trace, screenshot и video сохраняются только при failure.

### Known limitations

- Playwright не доказывает поведение physical Telegram Android/iOS WebView.
- Firefox/WebKit и pixel-perfect WebGL snapshots не входят в blocking matrix.

### Next recommended chunk

First Beautiful Room: 20–25 согласованных лицензированных assets и измерения на реальных мобильных устройствах без массового production-импорта.

## Completed

- Metadata-driven asset contract with dimensions, anchors, collision, snapping, rotation, interaction, variants and normalization.
- DragController with edge-preserving grab offset, imperative preview, last-valid recovery and cancel handling.
- Named wall/grid SnapState, wall priority, 5/9 cm hysteresis and rotated footprint constraints.
- Symmetric collision masks for furniture, decor and rugs; clearance separated from physical validity.
- Invisible touch-friendly interaction proxies; visual GLB/procedural meshes no longer drive selection.
- Four canonical GLB fixtures and deliberately malformed `ugly_sofa.glb`, all served as binary glTF.
- AssetLoader/AssetCache with normalization, byte metrics, shared geometry/textures/materials and selective variant material cloning.
- Thumbnail-only category rendering and latest-request-wins catalog loading.
- Camera gate, pointer cancel/lost-capture cleanup and separate invalid placement overlay.
- Development renderer/cache diagnostics.
- Domain, history, async race and actual GLB parsing tests.
- CI-gated Pages pipeline: quality must pass before the deploy artifact is built.
- External CC0 textured Sheen Chair with source/license record and production-like texture/triangle measurements.
- Official Telegram WebApp bridge, safe-area viewport metadata and opt-in Pages diagnostics via `?debug=1`.
- Lightweight room pass with warm hemisphere lighting and baseboards, without shadows or post-processing.

## Architecture decisions

- Raw pointer distance drives snap hysteresis; legal-room clamping happens after snap resolution.
- Snap state retains target identity rather than a generic per-axis boolean.
- Asset corrections live only in loader metadata and never in FurnitureRenderer.
- Cached sources have session lifetime; only owned variant materials are disposed per instance.
- Project schema remains version 1 because richer asset metadata is external to saved projects.

## Verification

- 20 automated tests pass across eight test files.
- TypeScript strict, ESLint and production build pass.
- Local runtime returned HTTP 200 and correct asset MIME types; the Pages build includes all fixture and external GLBs.
- Automated audit proves the malformed sofa normalizes to floor-level, centered canonical bounds while preserving its nested graph.

## Known limitations

- The environment exposed no in-app or Chrome browser backend, so the full visual 390×844 touch scenario could not be executed here.
- A real CC0 textured Sheen Chair is integrated and audited, but still needs the documented physical-device pass.
- Only rectangular rooms and floor placement are active.
- Fixture GLBs use embedded flat materials; the external chair establishes the unoptimized textured baseline. Meshopt/KTX2 are intentionally not enabled.
- No object-to-object snap, clearance recommendations, autosave or production LRU.

## Technical debt

- Run the documented mobile scenario on physical Android/iPhone Telegram WebViews.
- Add automated browser interaction coverage once a browser backend is available.

## Next recommended chunk

Run the physical-device matrix in `DEVICE_TEST.md`, fix only measured gesture/rendering defects, then curate a visually consistent trial catalog of roughly 20–25 licensed assets. Use the resulting network/GPU measurements before deciding on Meshopt or KTX2.
