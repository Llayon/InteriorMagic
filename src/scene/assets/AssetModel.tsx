import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { getAsset } from '@/editor/assets/registry';
import { assetCache } from './AssetCache';
import type { ReactNode } from 'react';

export function AssetModel({ assetId, variantId, fallback }: { assetId: string; variantId?: string; fallback: ReactNode }) {
  const asset = getAsset(assetId);
  const invalidate = useThree((state) => state.invalidate);
  const revision = useSyncExternalStore(assetCache.subscribe, assetCache.getRevision, assetCache.getRevision);
  useEffect(() => { void assetCache.load(asset).then(() => invalidate()).catch(() => invalidate()); }, [asset, invalidate]);
  const instance = useMemo(() => { void revision; return assetCache.instantiate(asset, variantId); }, [asset, variantId, revision]);
  useEffect(() => () => { if (instance) assetCache.disposeInstance(instance); }, [instance]);
  if (!instance) return fallback;
  return <primitive object={instance} dispose={null} />;
}
