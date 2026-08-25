# Production Catalog v1 — Acceptance Policy

Hard requirements are derived from upstream producer artifacts cited inline.
Do NOT introduce thresholds that do not exist in those artifacts.

## Hard requirements (selection FAILS if any are violated)

1. **Source pipeline membership.** Every selected id MUST be present in
   `runtime-catalog.json` (836) AND `catalog-payload.json` (836) from the
   authoritative data root.
2. **Upstream runtime policy status.** Every selected id MUST have
   `runtimePolicyStatus === 'PASS'` per
   `ithappy-production-pipeline/reports/runtime_policy_validation.csv`.
3. **Upstream geometry invariance.** Every selected id MUST have
   `geometryInvarianceStatus === 'PASS'` per
   `ithappy-production-pipeline/reports/geometry_invariance.csv`.
4. **Upstream GLTF validation.** Every selected id MUST have
   `gltfValidationStatus === 'PASS'` per
   `ithappy-production-pipeline/reports/gltf_validation.csv`.
5. **Conversion status.** Every selected id MUST have
   `conversionStatus === 'built'` per
   `ithappy-production-pipeline/reports/production_inventory.csv`.
6. **Thumbnail usability.** Every selected id MUST have a thumbnail per
   `ithappy-catalog-build/reports/thumbnail_inventory.csv`:
   - `thumbnailBytes > 0`
   - `thumbnailStatus` is non-empty
7. **Real producer policy constraints** (from
   `ithappy-production-pipeline/config/asset-policy.json`):
   - `maxTextureDimension ≤ 512` (the asset-policy default).
   - `policyVersion === 1` (matches asset-policy version).
9. **Safe runtime filename.** `runtimeFilename` matches
   `^runtime(-assets)?/<assetId>\.glb$`.
10. **Unique production id.** Selection manifest is sorted, deduplicated.
11. **Determinism.** Selection sort = natural sort (`Intl.Collator`,
    numeric-aware), identical across runs. No wall-clock timestamps in
    the selection JSON; only `pipelineVersion`, `sourcePolicySha256`,
    `sourcePipelineManifestSha256`, `sourcePayloadManifestSha256`,
    `trackBaseSha`.

## Important (emits warnings, not failures — A11)

- `authoritativeSemanticRole` is required for the final selection. It is
  NOT derived from `behaviorFor()` (prototype adapter). Filled per-asset
  after explicit verification (vision review).
- Missing TV-role entries: emit `tv_coverage_zero` BLOCKER (verdict
  remains achievable as long as other gates pass).
- Missing ITHappy license evidence: emit `provenance_unresolved`
  BLOCKER (cycle continues per A11).
- `thumbnailStatus` of `too-small` is allowed; emits warning per asset.

## Living-room relevance (technical shortlist, not visual gate)

Reduce 836 to ~100-150 candidates by sourceCategory. The technical
shortlist applies the table below:

| sourceCategory    | displayCategory  | shortlist? | reason |
| ----------------- | ---------------- | :--------: | --- |
| sofa              | seating          |   yes      | core living-room |
| chair             | seating          |   yes      | core living-room |
| coffee, work      | tables           |   yes      | core living-room |
| cupboard, dresser, shelf, entertainment | storage | yes | console candidates; entertainment also surfaces TVs |
| lamp              | lighting         |   yes      | core living-room |
| flower            | plants           |   yes      | core living-room |
| carpet            | decor            |   yes      | core living-room |
| picture, curtain, prop, electronics, ladder, training | decor | yes | decor candidates; electronics is TV audit target |
| bed               | bedroom          |    no      | not living-room Alpha |
| kitchen, bathroom | kitchen-bath     |    no      | not living-room Alpha |
| wall, floor, door, window, wallpaper | architecture | no | not furniture |

## A8 — Duplicate classification vocabulary

Only visual review may label a record as a true visual duplicate. Metrics
can only produce:

- `exact_duplicate` — impossible (runtimeFilename is derived from assetId).
- `metric_near_duplicate_candidate` — same `sourceCategory` AND
  `runtimeBytes ±1%` AND `triangleCount ±1%` AND equal `materialCount`
  AND equal `textureCount`.
- `intentional_variant` — shared `sourceCategory` with different files.
- `unique` — reserved (unused; current data has no singles within a category).
- `unknown` — reserved.

## Out of scope

- No new registry, no semantic ontology, no retail search.
- No binary optimization, no GLB re-authoring, no texture rewriting.
- No `behaviorFor()`` adoption as production semantics.
- No remote publication.

## Placement metadata

`prototype-placement.json` is **not** production metadata (see
`docs/catalog/prototype-placement-note.md`). Selection does not depend on
it. Placement-metadata gate remains blocked until a future track
publishes authoritative dimensions.