# Production Catalog v1 — Prototype-Placement Metadata: Non-Authoritative

## Upstream artifact

`prototype-placement.json` is produced by `scripts/ithappy-local-staging.mjs` →
`buildIthappyPrototypePlacement()` and consumed by `scripts/run-ithappy-registry-local.mjs`.
It is **not** present in the upstream ITHappy data root on a fresh checkout — it is
generated as part of the local staging flow and cleaned up on shutdown. See
`scripts/ithappy-local-staging.mjs`:

```js
const inspectBounds = async (runtimeRoot, assetIds) => {
  // ... parse GLB scene, setFromObject(...).getSize(...)
  return { provenance: 'prototype-raw-scene-bounds-not-production-metadata', assets };
};
```

## Self-declared as non-authoritative

The file's own `provenance` field is the literal string
`'prototype-raw-scene-bounds-not-production-metadata'`. Its `purpose` field is
`'remote-preview-only'`. Both fields appear in
`src/app/local/ithappyRegistryPrototype.ts`:

```ts
type PrototypePlacementDocument = {
  provenance: 'prototype-raw-scene-bounds-not-production-metadata';
  purpose: 'remote-preview-only';
  assets: Record<string, { dimensions: { width: number; height: number; depth: number } }>;
};
```

`R2_ASSET_DELIVERY.md` reinforces this:

> Prototype placement bounds remain ignored local test data. They are not part
> of either deployed manifest and are not authoritative dimensions, footprints,
> or placement metadata.

## Implications for Track I

1. Production Catalog v1 cannot depend on `prototype-placement.json` for
   authoritative dimensions, footprints, or placement metadata.
2. The deterministic content pack selects assets by `assetId`, `semanticRole`,
   `runtimeBytes`, `triangleCount`, `materialCount`, `textureCount`,
   `maxTextureDimension`. **No dimension or footprint fields are part of the
   selection manifest.**
3. If a future pipeline upgrade publishes authoritative dimensions, that
   upgrade is a separate track; this one does NOT solve the
   placement-metadata gate.

## Placement-metadata status for Track I verdict

**Blocked.** The selection manifest is a content pack. Activation in the
deterministic planner requires a future placement-metadata track.