# ADR: AR0 prebuilt true-scale single-asset AR

Status: Accepted for Track AR0.

## Decision

- The canonical GLB is the source runtime artifact. Because the raw Sheen Chair is not centered to the 1 mm AR tolerance, AR0 uses a file-level derivative with the editor's footprint recentering baked into a new root translation. The source file remains unchanged.
- USDZ is generated offline from that canonical GLB, validated, and stored beside it. Runtime or request-time GLB-to-USDZ conversion is forbidden.
- GLB and USDZ belong to one immutable `sheen-chair-r1` revision. The runtime manifest owns file identity and SHA256 only.
- `FurnitureAssetDefinition`, resolved through `getAsset(assetId)`, remains authoritative for dimensions, footprint, placement and semantic role. These facts are not copied into the revision manifest.
- Native AR is fixed physical scale, floor placement only, using Android Scene Viewer and iOS Quick Look through prebuilt `ios-src`. WebXR is deferred.
- Publication uses a new immutable `ar0/sheen-chair/r1/` R2 prefix. Existing `catalog/v1/**` objects are outside this contract and must remain untouched.
- RoomPlan, scanning, full-room/multi-object AR, RoomProject integration and planner/Room Geometry changes are deferred.
- Staged USDZ validation is fail-closed. CI requires committed `pxr.Usd/UsdGeom` evidence whose `assetRevisionId` and SHA256 match the exact immutable USDZ, with Y-up meter units, no unresolved dependencies, finite positive bounds and no axis differing from the canonical GLB by more than 1%.
- Evidence bounds are internally checked: `size` must equal `max - min`, and `sizeMeters` must equal `size * metersPerUnit` within a numeric tolerance.
- `VITE_AR0_ENABLED` is the single deployment/release capability gate and defaults OFF: only the literal `true` exposes the catalog CTA or permits the AR landing to instantiate. It is not asset, revision, catalog semantic or project metadata.
- A separate activation decision may set `VITE_AR0_ENABLED=true` only after R2 verification, Android physical QA and iOS physical/material QA pass. The flag is not evidence that those gates passed.
- Conversion provenance takes Blender's actual version from `converter-report.json` and enforces the approved 5.2 line. Remote verification compares the normalized MIME of every immutable object, in addition to bytes, SHA256 and CORS.
- Three `0.183.0` is an intentional cross-cutting dependency update required by pinned `@google/model-viewer` `4.3.1`.
- Publication is fail-closed before remote access: local bytes must match `checksums.json`, incomplete immutable prefixes are rejected, and `checksums.json` is uploaded only after every missing payload.

## Consequences

When explicitly activated, the browser retains an interactive 3D fallback. A structurally valid USDZ does not establish Quick Look material or physical-scale acceptance; those require the locked physical-device procedure. Any differing bytes require a new revision rather than an overwrite. Until all release gates pass and deployment opts in, merged AR0 code remains user-invisible.
