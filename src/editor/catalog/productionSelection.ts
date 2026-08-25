// src/editor/catalog/productionSelection.ts
// Single source of truth: imports the canonical JSON manifest.
// semanticRole uses the canonical FurnitureSemanticRole from @/editor/model/types.
import selection from './data/production-catalog-v1.json';
import type { FurnitureSemanticRole } from '@/editor/model/types';

export const PRODUCTION_CATALOG_VERSION = 1 as const;

export interface ProductionAssetRecord {
  assetId: string;
  semanticRole: FurnitureSemanticRole;
}

interface ProductionCatalogManifest {
  schemaVersion: number;
  trackBaseSha: string;
  sourcePolicySha256: string;
  sourcePipelineManifestSha256: string;
  sourcePayloadManifestSha256: string;
  pipelineVersion: string;
  policyVersion: number;
  assetCount: number;
  byRole: Record<string, number>;
  assets: ProductionAssetRecord[];
}

const MANIFEST = selection as ProductionCatalogManifest;

if (MANIFEST.schemaVersion !== PRODUCTION_CATALOG_VERSION) {
  throw new Error(`production-catalog version mismatch: ${MANIFEST.schemaVersion} != ${PRODUCTION_CATALOG_VERSION}`);
}

const BY_ID = new Map<string, ProductionAssetRecord>(MANIFEST.assets.map((a) => [a.assetId, a]));

export function getProductionSelection(): readonly ProductionAssetRecord[] {
  return MANIFEST.assets;
}

export function getVisibleIds(): readonly string[] {
  return MANIFEST.assets.map((a) => a.assetId);
}

export function isProductionCatalogId(assetId: string): boolean {
  return BY_ID.has(assetId);
}

export function getProductionAssetSemanticRole(assetId: string): FurnitureSemanticRole | undefined {
  return BY_ID.get(assetId)?.semanticRole;
}

export function withProductionFilter<T extends { assetId: string }>(items: readonly T[]): T[] {
  return items.filter((item) => BY_ID.has(item.assetId));
}