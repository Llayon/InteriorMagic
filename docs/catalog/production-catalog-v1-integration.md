# Production Catalog v1 — Runtime Integration

The Production Pack is opt-in. Default catalog behavior is unchanged.

## Architecture

```text
ITHappy pipeline (836)
   ↓ RuntimeAssetRegistry
   ↓ CatalogRepository
   ↓ configureCatalogRepository({ visibleIds: getVisibleIds() })
```

`configureCatalogRepository` is the only sanctioned runtime hook. The typed
consumer in `src/editor/catalog/productionSelection.ts` imports the canonical
JSON manifest at `src/editor/catalog/data/production-catalog-v1.json` and
exposes `getProductionSelection()`, `getVisibleIds()`,
`isProductionCatalogId()`, and `getProductionAssetSemanticRole()`.

## A7 — Production semantics are not yet activated at runtime

The current ITHappy prototype installer (`src/app/local/ithappyRegistryPrototype.ts`)
still uses its `behaviorFor()` adapter to derive `FurnitureAssetDefinition.semantic.role`
from `sourceCategory`. Track I verifies a per-asset `semanticRole` by direct visual
review, but does **not** modify the prototype installer (a frozen boundary). The
verified roles are available through the selection consumer for a future activation
path; they are not silently substituted into the prototype mapping here.

## Local activation (future opt-in)

```ts
import { installIthappyRegistryPrototype } from '@/app/local/ithappyRegistryPrototype';
import { configureCatalogRepository } from '@/editor/catalog/CatalogRepository';
import { getVisibleIds } from '@/editor/catalog/productionSelection';

const { catalog } = await installIthappyRegistryPrototype();
configureCatalogRepository(catalog, {
  visibleIds: [...getVisibleIds()],
  placementEnabledCategories: ['seating', 'tables', 'storage', 'lighting', 'plants', 'decor'],
});
```

No feature flag is wired in this track, so the normal catalog remains the full
catalog. Remote activation uses the same `visibleIds` path after the existing
R2/Pages delivery flow; no remote infrastructure is changed here.

## Placement metadata status

`prototype-placement.json` is explicitly non-authoritative
(`prototype-raw-scene-bounds-not-production-metadata`). The selection manifest
contains no dimensions, footprints, anchors, or orientation facts. A production
planner must wait for a future pipeline artifact with authoritative spatial
metadata; this is why the final Track I verdict is **C — Content Pack Ready /
Placement Metadata Blocked**.

## Verification

- `npm test -- src/editor/catalog/productionSelection*.test.ts`
- `node scripts/catalog/validate-selection.mjs`
- `npm run test:registry:ithappy:local` (baseline comparison documented in the final report)
- Existing E2E/catalog delivery suites remain unmodified.
