import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { getAsset } from '@/editor/assets/registry';
import { assetCache } from './AssetCache';
import type { ReactNode } from 'react';
import { renderingLifecycleDiagnostics } from '@/scene/lighting/renderingLifecycleDiagnostics';

export function AssetModel({ assetId, variantId, fallback }: { assetId: string; variantId?: string; fallback: ReactNode }) {
  const asset = getAsset(assetId);
  const invalidate = useThree((state) => state.invalidate);

  // Stable invalidator: keyed ONLY on the R3F `invalidate` (which is itself
  // stable per Canvas). Any unrelated rerender that recreates intermediate
  // values (callbacks, props, etc.) MUST NOT invalidate this reference,
  // otherwise the post-commit effect would refire on every parent rerender.
  const tracked = useCallback(() => {
    renderingLifecycleDiagnostics.recordInvalidate();
    invalidate();
  }, [invalidate]);

  const revision = useSyncExternalStore(assetCache.subscribe, assetCache.getRevision, assetCache.getRevision);

  // Kick off (or join) the cache load. Invalidate on settlement so demand-frameloop
  // eventually renders the new mesh, but do NOT rely on this invalidate landing
  // AFTER the React commit that installs the new <primitive> — see second useEffect
  // below for the post-commit guarantee.
  useEffect(() => {
    renderingLifecycleDiagnostics.recordAssetLoadStarted(asset.id);
    let cancelled = false;
    void assetCache
      .load(asset)
      .then(() => {
        if (cancelled) return;
        renderingLifecycleDiagnostics.recordAssetLoadResolved(asset.id, 'ready');
        tracked();
      })
      .catch(() => {
        if (cancelled) return;
        renderingLifecycleDiagnostics.recordAssetLoadResolved(asset.id, 'error');
        tracked();
      });
    return () => {
      cancelled = true;
    };
  }, [asset, tracked]);

  const instance = useMemo(() => {
    void revision;
    return assetCache.instantiate(asset, variantId);
  }, [asset, variantId, revision]);

  // Post-commit guarantee: when a fresh instance is installed by React after the
  // cache revision increments, schedule another invalidate. Keyed on
  // [instance, tracked, asset.id]. Because `tracked` is stable across rerenders
  // (see useCallback above), this effect re-fires ONLY when the instance
  // reference changes — exactly once per installed instance. Unrelated parent
  // rerenders cannot cause duplicate post-commit invalidates for the same
  // instance.
  useEffect(() => {
    if (instance) {
      renderingLifecycleDiagnostics.recordAssetInstanceInstalled(asset.id);
      tracked();
    }
  }, [instance, tracked, asset.id]);

  useEffect(() => () => { if (instance) assetCache.disposeInstance(instance); }, [instance]);

  if (!instance) return fallback;
  return <primitive object={instance} dispose={null} />;
}
