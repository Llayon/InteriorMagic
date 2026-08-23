import type { RuntimeAssetRegistry, RuntimeCatalogEntry } from '@/editor/assets/RuntimeAssetRegistry';

export type DisplayCategory = 'seating' | 'tables' | 'storage' | 'bedroom' | 'lighting' | 'plants' | 'decor' | 'kitchen-bath' | 'architecture';
export type CatalogCategoryId = DisplayCategory | 'sofas' | 'chairs' | 'rugs' | 'lamps';

export interface CatalogPayloadEntry {
  assetId: string;
  sourceCategory: string;
  displayCategory: string;
  displayName: string;
  thumbnailFilename: string;
  runtimeFilename: string;
  runtimeBytes: number;
  triangleCount: number;
  textureCount: number;
}

export interface CatalogItem {
  assetId: string;
  sourceCategory: string;
  displayCategory: DisplayCategory;
  displayName: string;
  thumbnailUrl: string;
  runtime: RuntimeCatalogEntry;
}

export const DISPLAY_CATEGORY_ORDER: DisplayCategory[] = ['seating', 'tables', 'storage', 'bedroom', 'lighting', 'plants', 'decor', 'kitchen-bath', 'architecture'];
export const DISPLAY_CATEGORY_LABELS: Record<DisplayCategory, string> = {
  seating: 'Сиденья', tables: 'Столы', storage: 'Хранение', bedroom: 'Спальня', lighting: 'Свет', plants: 'Растения', decor: 'Декор', 'kitchen-bath': 'Кухня и ванная', architecture: 'Архитектура',
};

const payloadCategoryMapping: Record<string, DisplayCategory> = {
  Seating: 'seating', Tables: 'tables', Storage: 'storage', Bedroom: 'bedroom', Lighting: 'lighting', Plants: 'plants', Decor: 'decor',
  'Kitchen & Bath': 'kitchen-bath', Architecture: 'architecture',
};

const categoryMapping: Record<string, DisplayCategory> = {
  sofa: 'seating', chair: 'seating', coffee: 'tables', work: 'tables', cupboard: 'storage', dresser: 'storage', shelf: 'storage', entertainment: 'storage',
  bed: 'bedroom', lamp: 'lighting', flower: 'plants', prop: 'decor', carpet: 'decor', picture: 'decor', curtain: 'decor', electronics: 'decor', ladder: 'decor', training: 'decor',
  kitchen: 'kitchen-bath', bathroom: 'kitchen-bath', wall: 'architecture', floor: 'architecture', door: 'architecture', window: 'architecture', wallpaper: 'architecture',
};

export const mapDisplayCategory = (sourceCategory: string): DisplayCategory => {
  const category = categoryMapping[sourceCategory];
  if (!category) throw new Error(`Unknown source category: ${sourceCategory}`);
  return category;
};

export const deriveDisplayName = (assetId: string) => assetId.split('_').map((part) => /^\d+$/.test(part) ? String(Number(part)) : `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');

const isSafeRelativePath = (value: string) => value.length > 0 && !value.includes('\\') && !value.split('/').includes('..') && !/^[a-z]:/i.test(value) && !value.includes('://') && !value.startsWith('/');

const isPayloadEntry = (value: unknown): value is CatalogPayloadEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['assetId', 'sourceCategory', 'displayCategory', 'displayName', 'thumbnailFilename', 'runtimeFilename'].every((key) => typeof entry[key] === 'string' && (entry[key] as string).length > 0) &&
    isSafeRelativePath(entry.thumbnailFilename as string) && isSafeRelativePath(entry.runtimeFilename as string) &&
    ['runtimeBytes', 'triangleCount', 'textureCount'].every((key) => typeof entry[key] === 'number' && Number.isFinite(entry[key]) && (entry[key] as number) >= 0);
};

export const parseCatalogPayload = (value: unknown): CatalogPayloadEntry[] => {
  if (!Array.isArray(value)) throw new Error('Catalog payload must be an array');
  const entries = value.map((entry, index) => {
    if (!isPayloadEntry(entry)) throw new Error(`Invalid catalog payload entry at index ${index}`);
    if (!payloadCategoryMapping[entry.displayCategory]) throw new Error(`Unknown display category: ${entry.displayCategory}`);
    return { ...entry };
  });
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.assetId)) throw new Error(`Duplicate catalog asset ID: ${entry.assetId}`);
    ids.add(entry.assetId);
  }
  return entries;
};

const naturalCompare = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;
const normalizedBase = (value: string) => value.endsWith('/') ? value : `${value}/`;

export class CatalogRepository {
  private readonly items: CatalogItem[];
  private readonly byId: Map<string, CatalogItem>;

  constructor(registry: RuntimeAssetRegistry, payload: CatalogPayloadEntry[], catalogBaseUrl: string) {
    if (payload.length !== registry.size) throw new Error(`Catalog/runtime entry count mismatch: ${payload.length}/${registry.size}`);
    const base = normalizedBase(catalogBaseUrl);
    this.items = payload.map((entry) => {
      const runtime = registry.get(entry.assetId);
      const displayCategory = payloadCategoryMapping[entry.displayCategory]!;
      if (runtime.category !== entry.sourceCategory || mapDisplayCategory(entry.sourceCategory) !== displayCategory) throw new Error(`Catalog category mismatch: ${entry.assetId}`);
      if (runtime.runtimeFilename !== entry.runtimeFilename || runtime.runtimeBytes !== entry.runtimeBytes || runtime.triangleCount !== entry.triangleCount || runtime.textureCount !== entry.textureCount) throw new Error(`Catalog/runtime metadata mismatch: ${entry.assetId}`);
      return {
        assetId: entry.assetId, sourceCategory: entry.sourceCategory, displayCategory, displayName: entry.displayName,
        thumbnailUrl: `${base}${entry.thumbnailFilename}`, runtime,
      };
    }).sort((a, b) => naturalCompare(a.assetId, b.assetId));
    this.byId = new Map(this.items.map((item) => [item.assetId, item]));
  }

  get size() { return this.items.length; }
  get(assetId: string) { const item = this.byId.get(assetId); if (!item) throw new Error(`Unknown catalog item: ${assetId}`); return item; }
  list() { return this.items.map((item) => ({ ...item, runtime: { ...item.runtime } })); }
  itemsFor(category: DisplayCategory, visibleIds?: ReadonlySet<string> | null) { return this.items.filter((item) => item.displayCategory === category && (!visibleIds || visibleIds.has(item.assetId))); }
  categories(visibleIds?: ReadonlySet<string> | null) { return DISPLAY_CATEGORY_ORDER.filter((category) => this.itemsFor(category, visibleIds).length > 0); }
  counts() { return Object.fromEntries(DISPLAY_CATEGORY_ORDER.map((category) => [category, this.itemsFor(category).length])) as Record<DisplayCategory, number>; }
}

export interface CatalogConfiguration {
  repository: CatalogRepository;
  visibleIds: ReadonlySet<string> | null;
  placementEnabledCategories: ReadonlySet<DisplayCategory>;
}

let activeConfiguration: CatalogConfiguration | null = null;
export const configureCatalogRepository = (repository: CatalogRepository, options: { visibleIds?: readonly string[]; placementEnabledCategories: readonly DisplayCategory[] }) => {
  activeConfiguration = { repository, visibleIds: options.visibleIds ? new Set(options.visibleIds) : null, placementEnabledCategories: new Set(options.placementEnabledCategories) };
};
export const getCatalogConfiguration = () => activeConfiguration;
