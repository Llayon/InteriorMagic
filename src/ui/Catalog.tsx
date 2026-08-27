import { useEffect, useRef, useState } from 'react';
import { assetList, getAsset } from '@/editor/assets/registry';
import { catalogRequestGate } from '@/editor/assets/requestGate';
import type { Category, FurnitureAssetDefinition } from '@/editor/model/types';
import { useEditorStore } from '@/editor/state/store';
import { assetCache } from '@/scene/assets/AssetCache';
import { DISPLAY_CATEGORY_LABELS, getCatalogConfiguration, type CatalogCategoryId, type DisplayCategory } from '@/editor/catalog/CatalogRepository';
import { buildAr0LandingUrl, getAr0RevisionForAsset } from '@/ar0/revisions';
import { openExternalLink } from '@/platform/externalLink';
import { isAr0Enabled } from '@/ar0/releaseGate';

const defaultTabs: [Category, string][] = [['sofas', 'Диваны'], ['chairs', 'Кресла'], ['tables', 'Столы'], ['plants', 'Растения'], ['rugs', 'Ковры'], ['lamps', 'Свет']];

export function Catalog() {
  const category = useEditorStore((state) => state.session.catalogCategory);
  const selectedId = useEditorStore((state) => state.session.selectedId);
  const object = useEditorStore((state) => state.project.objects.find((item) => item.instanceId === state.session.selectedId));
  const [loadingAssetId, setLoadingAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const catalogConfiguration = getCatalogConfiguration();
  const tabs: [CatalogCategoryId, string][] = catalogConfiguration
    ? catalogConfiguration.repository.categories(catalogConfiguration.visibleIds).map((id) => [id, DISPLAY_CATEGORY_LABELS[id]])
    : defaultTabs;
  const catalogItems = catalogConfiguration
    ? catalogConfiguration.repository.itemsFor(category as DisplayCategory, catalogConfiguration.visibleIds).map((item) => {
      const canPlace = catalogConfiguration.placementEnabledCategories.has(item.displayCategory);
      return { assetId: item.assetId, asset: canPlace ? getAsset(item.assetId) : null, canPlace, displayName: item.displayName, thumbnailUrl: item.thumbnailUrl };
    })
    : assetList.filter((asset) => asset.category === category).map((asset) => ({ assetId: asset.id, asset, canPlace: true, displayName: asset.name, thumbnailUrl: asset.thumbnailUrl }));
  const variants = object ? getAsset(object.assetId).variants : [];
  useEffect(() => catalogRequestGate.subscribe(() => setLoadingAssetId(null)), []);
  useEffect(() => { if (itemsRef.current) { itemsRef.current.scrollTop = 0; itemsRef.current.scrollLeft = 0; } }, [category]);
  const addAsset = async (asset: FurnitureAssetDefinition) => {
    const requestId = catalogRequestGate.begin();
    setLoadingAssetId(asset.id); setError(null);
    try {
      await assetCache.load(asset);
      if (catalogRequestGate.isCurrent(requestId)) {
        const instanceId = useEditorStore.getState().add(asset.id);
        if (instanceId) useEditorStore.getState().setSheetState('peek');
      }
    } catch {
      if (catalogRequestGate.isCurrent(requestId)) setError(`Не удалось загрузить «${asset.name}»`);
    } finally {
      if (catalogRequestGate.isCurrent(requestId)) setLoadingAssetId(null);
    }
  };
  return <div className="catalog-panel" data-testid="catalog">
    <div className="sheet-title"><div><small>КАТАЛОГ</small><strong>Добавьте характер комнате</strong></div>{object && <div className="variants">{variants.map((variant) => <button key={variant.id} aria-label={`Variant ${variant.id}`} className={object.variantId === variant.id ? 'active' : ''} style={{ background: variant.color }} onClick={() => selectedId && useEditorStore.getState().changeVariant(selectedId, variant.id)} />)}</div>}</div>
    <nav className="categories">{tabs.map(([id, label]) => <button key={id} data-category-id={id} aria-label={`Category ${id}`} className={category === id ? 'active' : ''} onClick={() => useEditorStore.getState().setCatalogCategory(id)}>{label}</button>)}</nav>
    {error && <div className="catalog-error" role="alert">{error}</div>}
    <div className="items" ref={itemsRef}>{catalogItems.map(({ assetId, asset, canPlace, displayName, thumbnailUrl }) => {
      const arRevision = isAr0Enabled() ? getAr0RevisionForAsset(assetId) : null;
      const arUrl = arRevision ? buildAr0LandingUrl(arRevision.arRevisionId) : null;
      return <div className={`item-shell ${arUrl ? 'has-ar' : ''}`} key={assetId}>
        <button className={`item ${object?.assetId === assetId ? 'active' : ''}`} data-asset-id={assetId} aria-label={canPlace ? `Add ${assetId}` : `Browse ${assetId}`} aria-busy={loadingAssetId === assetId} aria-disabled={!canPlace} disabled={!canPlace} onClick={() => asset && void addAsset(asset)}>{thumbnailUrl ? <img src={thumbnailUrl} alt={`${displayName} thumbnail`} loading="lazy" width="256" height="192" /> : <span>{asset?.icon}</span>}<b>{displayName}</b><small>{canPlace ? (loadingAssetId === assetId ? 'Загрузка…' : 'Добавить') : 'Только просмотр'}</small></button>
        {arUrl && <button className="item-ar-action" data-ar-asset-id={assetId} aria-label={`Примерить ${displayName} 1:1`} onClick={() => openExternalLink(arUrl)}>Примерить 1:1</button>}
      </div>;
    })}</div>
  </div>;
}
