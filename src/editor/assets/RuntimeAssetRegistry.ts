export interface RuntimeCatalogEntry {
  id: string;
  runtimeFilename: string;
  category: string;
  runtimeBytes: number;
  triangleCount: number;
  primitiveCount: number;
  materialCount: number;
  textureCount: number;
  maxTextureDimension: number;
  analyticalDecodedRGBABytes: number;
  policyVersion: number;
}

const isSafeRuntimeFilename = (value: string) =>
  value.length > 0 && !value.includes('\\') && !value.split('/').includes('..') &&
  !/^[a-z]:/i.test(value) && !value.includes('://');

const isCatalogEntry = (value: unknown): value is RuntimeCatalogEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && entry.id.length > 0 &&
    typeof entry.runtimeFilename === 'string' && isSafeRuntimeFilename(entry.runtimeFilename) &&
    typeof entry.category === 'string' &&
    ['runtimeBytes', 'triangleCount', 'primitiveCount', 'materialCount', 'textureCount', 'maxTextureDimension', 'analyticalDecodedRGBABytes', 'policyVersion']
      .every((key) => typeof entry[key] === 'number' && Number.isFinite(entry[key]) && (entry[key] as number) >= 0);
};

export const parseRuntimeCatalog = (value: unknown): RuntimeCatalogEntry[] => {
  if (!Array.isArray(value)) throw new Error('Runtime catalog must be an array');
  const entries = value.map((entry, index) => {
    if (!isCatalogEntry(entry)) throw new Error(`Invalid runtime catalog entry at index ${index}`);
    return { ...entry };
  });
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate runtime asset ID: ${entry.id}`);
    ids.add(entry.id);
  }
  return entries;
};

export class RuntimeAssetRegistry {
  private readonly entries: Map<string, RuntimeCatalogEntry>;
  private readonly baseUrl: string;

  constructor(entries: RuntimeCatalogEntry[], baseUrl: string) {
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  get size() { return this.entries.size; }

  get(assetId: string): RuntimeCatalogEntry {
    const entry = this.entries.get(assetId);
    if (!entry) throw new Error(`Unknown runtime asset: ${assetId}`);
    return entry;
  }

  resolveAssetUrl(assetId: string): string {
    return `${this.baseUrl}${this.get(assetId).runtimeFilename.replace(/^\/+/, '')}`;
  }
}
