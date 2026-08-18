# Asset Guide

## Canonical contract

- `1 Three.js unit = 1 meter`.
- `+Y` is up; canonical furniture forward is `+Z`.
- Origin is the center of the XZ footprint at floor level (`y = 0`).
- Export scale is `1,1,1`; rotations and object scale should be applied before export.
- A floor asset must rest on `y = 0` and should not contain distant hidden geometry that changes bounds.

Runtime instance position and `rotationY` are editor transforms. They must never compensate for mistakes in an individual model.

## Import normalization

Non-conforming sources use the registry `normalization` metadata. `AssetLoader` applies scale, XYZ Euler rotation and translation once, then optionally recenters XZ bounds and moves the lowest bound to `y = 0`. `FurnitureObject` receives only the canonical result.

`ugly_sofa.glb` is the audit fixture: source scale `0.01`, yaw `+90°`, offset pivot/floor, nested groups, an empty node and multiple meshes/materials. Its metadata applies scale `100`, yaw `-90°` and bounds recentering. Development builds warn when normalized dimensions differ from registry metadata by more than 12%.

Normalization is an escape hatch for imported assets, not a replacement for clean authoring.

## Geometry and naming

- Use descriptive lowercase `snake_case` node and material names.
- Material names referenced by variants must remain stable, for example `upholstery`, `wood`, `foliage`.
- Remove duplicate, hidden and zero-area meshes. Keep scene nesting shallow unless grouping has meaning.
- Prefer 5–15k triangles for normal furniture; large hero assets should remain below roughly 25k unless profiling justifies more.
- Avoid skinning and animation for static furniture. Animated/skinned assets will require a separate cloning strategy later.

## Materials and textures

- Prefer at most four material slots per asset.
- Use standard metallic/roughness PBR materials.
- Textures are normally 512×512; large furniture may use 1024×1024. Do not add 2K/4K textures without measurements.
- Reuse geometry, textures and unchanged materials across instances. Clone a material only when an instance variant changes it.
- Production assets may use Meshopt and KTX2/Basis after the pipeline is enabled; no post-processing or shader framework is assumed.

## Catalog files

Cards reference independent lightweight `thumbnailUrl` resources. Rendering a category must not request its GLB files. The model is requested only after a user chooses an item or when a saved project requires that asset.
