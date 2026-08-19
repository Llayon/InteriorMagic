import { useEffect, useState } from 'react';
import { assetList, getAsset } from '@/editor/assets/registry';
import { catalogRequestGate } from '@/editor/assets/requestGate';
import type { Category, FurnitureAssetDefinition } from '@/editor/model/types';
import { useEditorStore } from '@/editor/state/store';
import { assetCache } from '@/scene/assets/AssetCache';

const tabs: [Category, string][] = [['sofas', 'Диваны'], ['chairs', 'Кресла'], ['tables', 'Столы'], ['plants', 'Растения'], ['rugs', 'Ковры'], ['lamps', 'Свет']];

export function Catalog() {
  const category = useEditorStore((state) => state.session.catalogCategory);
  const selectedId = useEditorStore((state) => state.session.selectedId);
  const object = useEditorStore((state) => state.project.objects.find((item) => item.instanceId === state.session.selectedId));
  const [loadingAssetId, setLoadingAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const variants = object ? getAsset(object.assetId).variants : [];
  useEffect(() => catalogRequestGate.subscribe(() => setLoadingAssetId(null)), []);
  const addAsset = async (asset: FurnitureAssetDefinition) => {
    const requestId = catalogRequestGate.begin();
    setLoadingAssetId(asset.id); setError(null);
    try {
      await assetCache.load(asset);
      if (catalogRequestGate.isCurrent(requestId)) useEditorStore.getState().add(asset.id);
    } catch {
      if (catalogRequestGate.isCurrent(requestId)) setError(`Не удалось загрузить «${asset.name}»`);
    } finally {
      if (catalogRequestGate.isCurrent(requestId)) setLoadingAssetId(null);
    }
  };
  return <section className="sheet" data-testid="catalog">
    <div className="handle" /><div className="sheet-title"><div><small>КАТАЛОГ</small><strong>Добавьте характер комнате</strong></div>{object && <div className="variants">{variants.map((variant) => <button key={variant.id} aria-label={`Variant ${variant.id}`} className={object.variantId === variant.id ? 'active' : ''} style={{ background: variant.color }} onClick={() => selectedId && useEditorStore.getState().changeVariant(selectedId, variant.id)} />)}</div>}</div>
    <nav className="categories">{tabs.map(([id, label]) => <button key={id} data-category-id={id} aria-label={`Category ${id}`} className={category === id ? 'active' : ''} onClick={() => useEditorStore.getState().setCatalogCategory(id)}>{label}</button>)}</nav>
    {error && <div className="catalog-error" role="alert">{error}</div>}
    <div className="items">{assetList.filter((asset) => asset.category === category).map((asset) => <button className="item" key={asset.id} data-asset-id={asset.id} aria-label={`Add ${asset.id}`} aria-busy={loadingAssetId === asset.id} onClick={() => void addAsset(asset)}>{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt={`${asset.name} thumbnail`} loading="lazy" /> : <span>{asset.icon}</span>}<b>{asset.name}</b><small>{loadingAssetId === asset.id ? 'Загрузка…' : 'Добавить'}</small></button>)}</div>
  </section>;
}
