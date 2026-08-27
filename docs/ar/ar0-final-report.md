# AR0 final report — prebuilt true-scale Sheen Chair AR

## Verdict

**A — AR0 SOFTWARE READY / MERGEABLE DEFAULT-OFF**

The local immutable revision and product integration are complete. This is not a claim that production native AR has passed: neither Android Scene Viewer nor iOS Quick Look was available for physical QA, and Cloudflare authentication was unavailable.

## Source and revision evidence

- Asset revision: `sheen-chair-r1` for `sheenChair` (`arRevisionId`; this is not Track K's future `assetRevisionId`)
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
- Committed stage evidence: `docs/ar/evidence/sheen-chair-r1/usdz-stage-report.json`, evidence SHA256 `a5d549f4c457341d9a4aa19cfdc683c0d3b58a5a6aa555bf87490cdfd0a1cf1a`; its `usdzSha256` is the exact immutable r1 hash above. Missing, malformed, stale or mismatched evidence now fails staged validation. The staged verifier reads `artifacts/ar0/sheen-chair/r1/model.usdz`; no synthetic fallback exists.
- Evidence validation also rejects internally inconsistent `min`/`max`/`size`/`sizeMeters` values, rather than trusting only the GLB comparison vector.
- Blender USDZ bytes were not deterministic across repeated exports; the selected validated bytes are immutable by their recorded checksum. Poster bytes were deterministic.
- Poster: `11,704` bytes, SHA256 `a70151d0eaf81ed1fd8cb7c90b34deaa68a9540dfe689710551a55b2721e226c`
- Status: **USDZ STRUCTURALLY BUILT / IOS MATERIAL QA PENDING**
- Manifest SHA256: `c40c9730dc8b304b8f07b12a77c8350a137e76541e1d7e05a889153eaea14889`
- Checksums SHA256: `d3ffc6eda5490f361e423a67edf381ef8bf2041d62a030d5ba9ae0840400494b`

## Product integration and delivery

- `@google/model-viewer` is pinned at `4.3.1`; the cross-cutting Three `0.183.0` upgrade and matching typings are intentional and required by its exact peer dependency.
- Viewer uses canonical `src`, mandatory prebuilt `ios-src`, `ar`, `scene-viewer quick-look`, `ar-scale="fixed"`, `ar-placement="floor"` and no WebXR.
- The v2 runtime manifest owns frozen dimensions `0.826557978 × 0.686247078 × 0.570265459` m and floor/fixed AR facts; `getAsset('sheenChair')` is used only for the presentation name.
- `TelegramWebAppHost.openLink` and the catalog click path are synchronous. Telegram receives exactly one absolute URL; an ordinary browser uses an external-link fallback.
- `VITE_AR0_ENABLED` is a deployment/release gate, not asset metadata. Absent, empty or any value other than literal `true` hides the catalog CTA and makes direct AR URLs fail closed without model-viewer. With literal `true`, only Sheen Chair has the `Примерить 1:1` action. The existing Add action remains separate; AR does not add furniture.
- Local Vite delivery returns `model/gltf-binary` and `model/vnd.usdz+zip`.
- R2 published: **no**. Prefix reserved: `ar0/sheen-chair/r1/`; no upload or remote verification was run in this fix-pass. `--upload` now fails closed before any remote call until a conditional create-only publisher is available. `--verify` requires both `AR0_R2_PUBLIC_ORIGIN` and `AR0_APP_ORIGIN`, and fails incorrect MIME for GLB, USDZ, WebP, manifest JSON and checksums JSON, while retaining length, SHA256 and exact-origin-or-wildcard CORS checks. No existing release was overwritten.
- The publisher verifies local bytes against checksums and refuses an incomplete prefix where `checksums.json` exists without a payload; no R2 mutation occurred.
- Future conversion provenance reads the actual `bpy.app.version_string` from Blender's converter report, rejects malformed provenance and enforces the approved Blender 5.2 line; it no longer hardcodes a version label. The selected r1 USDZ was not regenerated.

## Verification

- The implementation freeze is defined by Git/PR state; CI authority is the required checks for the current PR head.
- Unit suite: **472 passed across 58 files**; AR0 manifest v2 coverage includes valid, legacy-schema, identity, dimensions, AR mode, path and SHA failures.
- Dedicated AR0 E2E: **12 passed** locally across mobile-small, desktop and default-off projects. The browser fixture ignores only the expected post-decode `net::ERR_ABORTED` for the GLB request; response status, MIME, viewer properties, manifest-derived facts and fallback assertions remain active.
- Full browser regression: **77 passed, 6 existing project-specific skips (83 total)**; AR0 cases remain isolated in dedicated projects and the default-off deployment behavior is covered independently.
- Global browser/planner jobs use the default merge-context checkout again. A PR-only `ar0-evidence` job checks the exact PR head, runs staged AR0 verification and the dedicated AR0 suite.
- Planner fixture E2E: **22 passed**; planner-real: **14 passed**; planner-intent: **4 passed**.
- Typecheck, E2E typecheck, lint, production build (including the `dist/ar0` boundary check), staged AR0 verifier and `git diff --check`: passed.
- Draft PR: [#18](https://github.com/Llayon/InteriorMagic/pull/18). Quality, Chromium, planner and AR0 evidence jobs are required checks for the current PR head.
- Android physical QA: **NOT RUN**.
- iOS physical QA: **NOT RUN**.

## Remaining AR1 work

- Publish the exact immutable bytes to R2 when non-interactive credentials are available, then verify every object, USDZ MIME, app-origin CORS and remote model consumption.
- Complete Android and iOS physical QA at ~1 m and ~2 m using the locked ≤3 cm tolerance; confirm fixed scale, floor contact, orientation and material fidelity.
- Only after R2 verification, Android PASS and iOS physical/material PASS may a separate deployment decision set `VITE_AR0_ENABLED=true`; production remains default-off meanwhile.
- Evaluate additional assets, improved reproducible USDZ packaging and WebXR only as separately approved follow-up work.

There is no runtime USDZ conversion, RoomProject change, planner change, Room Geometry change, backend, Track I modification, `catalog/v1` mutation, application deployment or merge in this track.

No R2 upload or remote verification, Pages deployment, merge, catalog/v1 mutation, or immutable r1 replacement occurred.
