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

## Consequences

The browser always retains an interactive 3D fallback. A structurally valid USDZ does not establish Quick Look material or physical-scale acceptance; those require the locked physical-device procedure. Any differing bytes require a new revision rather than an overwrite.
