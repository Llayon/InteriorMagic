import type { RuntimeAssetRegistry, RuntimeCatalogEntry } from '@/editor/assets/RuntimeAssetRegistry';

export type DisplayCategory = 'seating' | 'tables' | 'storage' | 'bedroom' | 'lighting' | 'plants' | 'decor' | 'kitchen-bath' | 'architecture';
export type CatalogCategoryId = DisplayCategory | 'sofas' | 'chairs' | 'rugs' | 'lamps';

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

const naturalCompare = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;

export class CatalogRepository {
  private readonly items: CatalogItem[];
  private readonly byId: Map<string, CatalogItem>;

  constructor(registry: RuntimeAssetRegistry, thumbnailBaseUrl: string) {
    const base = thumbnailBaseUrl.endsWith('/') ? thumbnailBaseUrl : `${thumbnailBaseUrl}/`;
    this.items = registry.list().map((runtime) => ({
      assetId: runtime.id,
      sourceCategory: runtime.category,
      displayCategory: mapDisplayCategory(runtime.category),
      displayName: deriveDisplayName(runtime.id),
      thumbnailUrl: `${base}${runtime.id}.webp`,
      runtime,
    })).sort((a, b) => naturalCompare(a.assetId, b.assetId));
    this.byId = new Map(this.items.map((item) => [item.assetId, item]));
  }

  get size() { return this.items.length; }
  get(assetId: string) { const item = this.byId.get(assetId); if (!item) throw new Error(`Unknown catalog item: ${assetId}`); return item; }
  list() { return this.items.map((item) => ({ ...item, runtime: { ...item.runtime } })); }
  itemsFor(category: DisplayCategory, visibleIds?: ReadonlySet<string>) { return this.items.filter((item) => item.displayCategory === category && (!visibleIds || visibleIds.has(item.assetId))); }
  categories(visibleIds?: ReadonlySet<string>) { return DISPLAY_CATEGORY_ORDER.filter((category) => this.itemsFor(category, visibleIds).length > 0); }
  counts() { return Object.fromEntries(DISPLAY_CATEGORY_ORDER.map((category) => [category, this.itemsFor(category).length])) as Record<DisplayCategory, number>; }
}

let activeRepository: CatalogRepository | null = null;
let activeVisibleIds: ReadonlySet<string> | null = null;
export const configureCatalogRepository = (repository: CatalogRepository, visibleIds: readonly string[]) => { activeRepository = repository; activeVisibleIds = new Set(visibleIds); };
export const getCatalogConfiguration = () => activeRepository && activeVisibleIds ? { repository: activeRepository, visibleIds: activeVisibleIds } : null;
