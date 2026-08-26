# AR0 final report — prebuilt true-scale Sheen Chair AR

## Verdict

**D — AR0 SOFTWARE READY / R2 PUBLISH PENDING / PHYSICAL QA PENDING / PRODUCTION ACTIVATION OFF**

The local immutable revision and product integration are complete. This is not a claim that production native AR has passed: neither Android Scene Viewer nor iOS Quick Look was available for physical QA, and Cloudflare authentication was unavailable.

## Source and revision evidence

- Base SHA: `cfaf3064555e1f61823c49533037cf4bc78092c6`
- Branch: `feature/ar0-prebuilt-sheen-chair`
- Worktree: `C:\Users\Max\InteriorMagic\.worktrees\ar0-prebuilt-sheen-chair`
- Tested implementation SHA: `641739b` (fix-pass implementation and final verification head; this report-only correction follows)
- Asset revision: `sheen-chair-r1` for `sheenChair`
- Local origin: Vite test/development middleware serves the committed `artifacts/ar0/sheen-chair/r1/` revision at same-origin `${BASE_URL}ar0/sheen-chair/r1/`; production Pages builds do not copy `artifacts/` into `dist/`
- AR URL: absolute application URL under `BASE_URL`, query `?ar=sheen-chair-r1`

Raw GLB (`public/models/sheen_chair.glb`):

- Bounds: width `0.826557978`, height `0.686247078`, depth `0.570265459` m
- minY `-0.000069778`, centerX `-0.000743411`, centerZ `0.008407630` m
- SHA256: `f0af2a2b102d28d540236306ae19f8fb36842df76bd38cf76f063f9bd2853399`
- Result: rejected as canonical because centerZ exceeds 1 mm

Canonical derivative (`model.glb`):

- Bounds: width `0.826557978`, height `0.686247078`, depth `0.570265459` m
- minY `0`, centerX `0`, centerZ `0`
- Baked translation: `[0.000743411, 0.000069778, -0.0084076295]` m; no scale or rotation repair
- SHA256: `a38f20af9f527b1d1cef1220ce5d19489498f7b2cd0ca0ca6ea35f82b0cb8f22`
- Geometry/BIN chunks, seven embedded GLB images, six materials and `KHR_materials_sheen` were preserved

USDZ and poster:

- Converter: Blender 5.2.0 LTS, `D:\Programms\Blender\5.2\blender.exe`
- Route: canonical GLB → Blender glTF import in meters → USDZ export with Y-up, +Z forward, `metersPerUnit=1`
- Command: Blender `--background --factory-startup --python scripts/ar0/export-usdz.py -- --input <canonical model.glb> --output <model.usdz> --poster <poster.webp> --report <converter-report.json>`
- USDZ: `4,897,846` bytes, SHA256 `4b0bec120f9db100b888b7083a8e2d7873d7c2f56d5343b65eb4c8fc69330618`
- USDZ stage bounds in meters: `0.826557964 × 0.686247091 × 0.570265472`
- Package: `model.usdc` plus five packaged PNG textures; no unresolved dependencies
- Stage read: Blender-bundled `pxr.Usd/UsdGeom`; GLB/USDZ delta is below 1% on every axis
- Committed stage evidence: `docs/ar/evidence/sheen-chair-r1/usdz-stage-report.json`, evidence SHA256 `22655487ddba45da0fb00c565106632a4888e778dffd754008a09e96bce38a7c`; its `usdzSha256` is the exact immutable r1 hash above. Missing, malformed, stale or mismatched evidence now fails staged validation. The staged verifier reads `artifacts/ar0/sheen-chair/r1/model.usdz`; no synthetic fallback exists.
- Evidence validation also rejects internally inconsistent `min`/`max`/`size`/`sizeMeters` values, rather than trusting only the GLB comparison vector.
- Blender USDZ bytes were not deterministic across repeated exports; the selected validated bytes are immutable by their recorded checksum. Poster bytes were deterministic.
- Poster: `11,704` bytes, SHA256 `a70151d0eaf81ed1fd8cb7c90b34deaa68a9540dfe689710551a55b2721e226c`
- Status: **USDZ STRUCTURALLY BUILT / IOS MATERIAL QA PENDING**
- Manifest SHA256: `47f8edceeead1c89995ffb9344923e6e11b3b3ac6cc53668dbc0ec3cb151e289`
- Checksums SHA256: `63c1b2d12dee29a3ff828f95e1e9d764ddb488c05dd18b29839284e67fe6a82d`

## Product integration and delivery

- `@google/model-viewer` is pinned at `4.3.1`; the cross-cutting Three `0.183.0` upgrade and matching typings are intentional and required by its exact peer dependency.
- Viewer uses canonical `src`, mandatory prebuilt `ios-src`, `ar`, `scene-viewer quick-look`, `ar-scale="fixed"`, `ar-placement="floor"` and no WebXR.
- Dimensions shown on the landing are resolved from `getAsset('sheenChair')`: 82.7 × 68.7 × 57.1 cm.
- `TelegramWebAppHost.openLink` and the catalog click path are synchronous. Telegram receives exactly one absolute URL; an ordinary browser uses an external-link fallback.
- `VITE_AR0_ENABLED` is a deployment/release gate, not asset metadata. Absent, empty or any value other than literal `true` hides the catalog CTA and makes direct AR URLs fail closed without model-viewer. With literal `true`, only Sheen Chair has the `Примерить 1:1` action. The existing Add action remains separate; AR does not add furniture.
- Local Vite delivery returns `model/gltf-binary` and `model/vnd.usdz+zip`.
- R2 published: **no**. Prefix reserved: `ar0/sheen-chair/r1/`; no upload or remote verification was run in this fix-pass. `--upload` now fails closed before any remote call until a conditional create-only publisher is available. `--verify` requires both `AR0_R2_PUBLIC_ORIGIN` and `AR0_APP_ORIGIN`, and fails incorrect MIME for GLB, USDZ, WebP, manifest JSON and checksums JSON, while retaining length, SHA256 and exact-origin-or-wildcard CORS checks. No existing release was overwritten.
- The publisher verifies local bytes against checksums and refuses an incomplete prefix where `checksums.json` exists without a payload; no R2 mutation occurred.
- Future conversion provenance reads the actual `bpy.app.version_string` from Blender's converter report, rejects malformed provenance and enforces the approved Blender 5.2 line; it no longer hardcodes a version label. The selected r1 USDZ was not regenerated.

## Verification

- Initial baseline at the then-current `ba9a721`: 279 unit tests passed; typecheck, E2E typecheck, lint and build passed. Main later moved to `442bc7af5e37d3d23a1580c161fdb87d78b02cef`, and this branch includes that merge.
- Final fix-pass unit suite: **461 passed across 57 files** with `NODE_OPTIONS=--no-experimental-webstorage` on local Node 25. The option only compensates for the runner's invalid experimental localStorage object; repository CI uses Node 24.
- Dedicated AR0 E2E: 8 passed locally across mobile-small, desktop and default-off projects. The browser fixture ignores only the expected post-decode `net::ERR_ABORTED` for the GLB request; response status, MIME, viewer properties and fallback assertions remain active. The Vite AR middleware also closes aborted streams so the test server cannot retain the model request.
- Full browser regression: **73 passed, 6 existing project-specific skips (79 total)**; AR0 cases remain isolated in dedicated projects and the default-off deployment behavior is covered independently.
- Global browser/planner jobs use the default merge-context checkout again. A PR-only `ar0-evidence` job checks the exact PR head, runs staged AR0 verification and the dedicated AR0 suite.
- Planner fixture E2E: **22 passed**; planner-real: **14 passed**; planner-intent: **4 passed**.
- Typecheck, E2E typecheck, lint, production build (including the `dist/ar0` boundary check), staged AR0 verifier and `git diff --check`: passed.
- Draft PR: [#18](https://github.com/Llayon/InteriorMagic/pull/18). Quality, Chromium and planner jobs retain merge-context coverage; exact-head AR0 evidence is isolated to the PR-only job.
- Android physical QA: **NOT RUN**.
- iOS physical QA: **NOT RUN**.

## Remaining AR1 work

- Publish the exact immutable bytes to R2 when non-interactive credentials are available, then verify every object, USDZ MIME, app-origin CORS and remote model consumption.
- Complete Android and iOS physical QA at ~1 m and ~2 m using the locked ≤3 cm tolerance; confirm fixed scale, floor contact, orientation and material fidelity.
- Only after R2 verification, Android PASS and iOS physical/material PASS may a separate deployment decision set `VITE_AR0_ENABLED=true`; production remains default-off meanwhile.
- Evaluate additional assets, improved reproducible USDZ packaging and WebXR only as separately approved follow-up work.

There is no runtime USDZ conversion, RoomProject change, planner change, Room Geometry change, backend, Track I modification, `catalog/v1` mutation, application deployment or merge in this track.

## Landing-quality fix-pass handoff

- Pushed implementation head: `641739b73b168d21272d0fc85c4145e1a06ab5c1`.
- Commits: `369a1de` (artifact/public boundary), `9fdbc26` (release verification and activation gates), `f41fdd7` (evidence report), `5eed0e7` (lazy editor bootstrap/planner import race), `8cfdbac` (final counts), `0bcb4d2` (PR handoff), `06cd5a7` (restore planner bootstrap timing), `641739b` (final CI verification report).
- Exact-head PR CI run `32995381463` completed with `quality` SUCCESS, `e2e-chromium` SUCCESS, `e2e-planner` SUCCESS, and PR-only `ar0-evidence` SUCCESS. The run tested exactly `641739b73b168d21272d0fc85c4145e1a06ab5c1`; Pages build/deploy remained skipped for the pull request.
- No R2 upload or remote verification, Pages deployment, merge, catalog/v1 mutation, or immutable r1 replacement occurred.
