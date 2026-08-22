# Progress

## 2026-08-23 — Track D: Telegram physical-device measurement harness

### Completed

- Introduced `src/platform/telegram/host.ts` as the single typed access point to the official Telegram WebApp host (platform/version/isActive/viewportStableHeight/safe-area insets, `activated`/`deactivated` events, verified against core.telegram.org/bots/webapps); `src/telegram/telegram.ts` now consumes it and remains the only CSS safe-area writer.
- Added opt-in `?deviceQa=1` physical-device diagnostics under `src/deviceqa/`: environment snapshot (viewport, DPR, touch, UA, Telegram host fields, unmasked WebGL vendor/renderer), demand-render renderer snapshot (no idle FPS), AssetCache-derived asset/byte/failure state, texture count plus an explicitly labelled estimate with method/coverage, lifecycle log (visibility, pagehide/show, Telegram activated/deactivated, observational WebGL context loss/restoration), and frame-pacing windows (p50/p95/worst, >33 ms / >50 ms shares) observed via `useFrame` only — the recorder never invalidates frames.
- Fixed 5-second capture windows for orbit/pinch/sheet; automatic drag window driven by session mode transitions; named export checkpoints A (cold-ready), B (loaded-session), C (post-resume), D (heavy-stress, Sheen Chair as intentionally heavyweight stress object, not the production target).
- One-tap JSON report export with clipboard fallback dialog; documented frozen benchmark procedure in `docs/qa/telegram-device-performance.md`.

### Architecture decisions

- Device QA is separate from the developer `?debug=1` overlay; when `?deviceQa=1` is absent it causes no behavioral or runtime measurement activity (no zero-bundle-payload claim is made). Fixed pacing windows close on exact wall-clock timers without inducing rendering.
- Texture memory is reported as `kind: "estimate"` with method/coverage; renderer texture COUNT stays the authoritative measured value. The environment report carries both official Telegram inset sources (`safeAreaInset`, `contentSafeAreaInset`).
- `webglcontextlost`/`restored` are logged without `preventDefault()` or recovery behavior — the first physical run must reveal natural WebView behavior.
- No optimization shipped in this track: no LRU, no KTX2/Meshopt, no DPR change, no cache manager. All such decisions are deferred until physical measurements exist.

### Known limitations

- No physical Telegram Android/iOS data yet; the PR ends at READY FOR PHYSICAL DEVICE BASELINE.
- Sheet animation is CSS-driven, so its pacing window may legitimately contain few rendered frames.
- Cold-open timing is human-judged ("room visibly usable"), not instrumented.

### Next recommended chunk

Run the physical benchmark per the runbook on one iPhone and one Android (portrait), return REPORT A/B/C(/D) + FINAL JSON and observations, then classify findings P0/P1/P2 and only then consider minimal fixes.

## 2026-08-19 — Rendering Baseline + First Beautiful Room

### Completed

- Added a cached local RoomEnvironment/PMREM baseline, ACES Filmic tone mapping, calibrated exposure/environment/key intensities, and cheap blob grounding without shadow maps or post-processing.
- Imported ten coherent CC0 Kenney Furniture Kit floor assets with local thumbnails, canonical normalization metadata and minimal `semantic.role` values.
- Added a separate nine-object `?demo=1` curated living-room fixture; the normal user project remains unchanged.
- Audited every trial GLB and recorded network, triangle, primitive, material, texture and estimated GPU texture costs in `ASSET_AUDIT.md`.
- Added GLB normalization tests and browser-level catalog/demo budget checks; captured headed Chromium evidence at 390×844, 430×932 and 1440×900.

### Architecture decisions

- RoomProject remains version 1 and FurnitureInstance is unchanged; semantics live in static AssetRegistry metadata.
- Grounding is a render overlay and does not mutate shared GLB materials or domain collision state.
- The chosen family is intentionally texture-free and very light; the existing textured Sheen Chair remains the material-extension stress test, not the catalog average.
- No ECS, surface placement, asset-specific React renderers, compression pipeline or post-processing was introduced.

### Known limitations

- The coherent low-poly family proves a pleasant inexpensive visual direction, but it does not prove a photorealistic textured catalog.
- Blob shadows are deliberately approximate and do not react to furniture height or inter-object occlusion.
- Physical Telegram Android/iOS and Safari iPhone furnished-room passes are still outstanding.
- Cold-load impressions and sustained thermals require real network/device measurements; localhost Chromium timing is not representative.

### Next recommended review

Review screenshots, `ASSET_AUDIT.md`, browser metrics and physical-device results before expanding. Choose one path: **A)** successful trial → extend the same family toward 20–25 assets; **B)** assets too heavy → a measured optimization experiment; **C)** assets good but presentation insufficient → one focused rendering adjustment; **D)** device limits → a mobile performance pass.

## 2026-08-19 — Final browser QA hardening

### Completed

- Added real Chromium touch selection, edge drag, camera isolation, commit and cancellation coverage using touchscreen/CDP input.
- Added deterministic lost-pointer-capture cleanup and verified rollback without a Move history entry.
- Replaced the permissive 35 cm grab check with an 8 CSS px pointer-to-object screen-offset invariant for mouse and touch.
- Added E2E TypeScript compilation, CI enforcement, a 15-minute browser-job timeout, and a bounded four-viewport matrix.
- Covered the 360×700 short-height branch, popup bounds, toolbar/catalog separation, critical touch targets, catalog visibility and page overflow.

### Architecture decisions

- Diagnostics remain read-only and test-mode-only; camera and interaction observations do not expose editor commands.
- Touch drag uses Chromium CDP only because Playwright touchscreen has no multi-step drag API.
- Core tests run on mobile-small and desktop; touch runs on mobile-short/mobile-small; responsive runs on all four profiles.

### Known limitations

- Chromium emulation is not a physical Telegram Android/iOS WebView test.
- WebKit, broad diagnostics refactors and additional QA frameworks are intentionally deferred.

### Next recommended chunk

Mobile Workspace UX + First Beautiful Room: fullscreen workspace, collapsible sheet states, UI-aware camera framing, consolidated materials/reset flows, one coherent room and 20–25 licensed consistent assets.

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
## 2026-08-19 — Mobile Workspace UX

### Completed

- Replaced the stacked mobile layout with a full-height 3D workspace and overlay header, controls and shared bottom sheet.
- Added closed, peek and expanded sheet states, pointer handle gestures, catalog/material panel switching and post-load auto-collapse.
- Added centralized usable-viewport-aware Fit Room framing and a Home action while preserving demand rendering.
- Split global history/camera controls from contextual object controls.
- Replaced native reset confirmation with an in-app destructive dialog.
- Added Telegram stable viewport/content-safe-area CSS integration and removed the production grid helper.
- Added product E2E coverage for sheet state, materials boundaries, reset, gesture isolation, responsive workspace and Fit Room.
- Correctness follow-up unified expanded-sheet geometry for the sheet and object toolbar, switched camera fitting to measured safe-area-aware DOM geometry and projected room bounds, and fixed orientation preservation after any prior Home action.

### Architecture decisions

- Workspace layout state remains in `EditorSession`; `RoomProject` and its schema are unchanged.
- Camera distance is derived from room bounds and usable FOV; focal offset centers the room in the unoccupied viewport rather than using handler-specific offsets.
- Sheet gestures settle state once and CSS animates the overlay without resizing or remounting Canvas.

### Known limitations

- Physical Telegram Android/iOS and Safari iPhone verification remains outstanding.
- The current room and fixture assets intentionally retain the pre-existing rendering baseline.

### Next recommended chunk

Rendering Baseline + First Beautiful Room: lightweight IBL and calibrated tone/exposure, cheap grounding, 8–12 coherent licensed assets and real thumbnails, followed by network/triangle/draw-call/VRAM measurements and a physical Android/iPhone Telegram pass. Expand toward 20–25 assets only after that measured trial succeeds.
