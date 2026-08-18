import { useEffect, useState } from 'react';
import { useEditorStore } from '@/editor/state/store';
import { assetCache } from '@/scene/assets/AssetCache';
import { getRenderMetrics, type RenderMetrics } from './debugMetrics';

const formatBytes = (value: number) => value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;

export function DebugOverlay() {
  const selected = useEditorStore((state) => state.session.selectedId);
  const [metrics, setMetrics] = useState<RenderMetrics>(getRenderMetrics());
  const [assets, setAssets] = useState(assetCache.metrics());
  useEffect(() => {
    const refresh = () => { setMetrics(getRenderMetrics()); setAssets(assetCache.metrics()); };
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, []);
  const idle = performance.now() - metrics.sampledAt > 700;
  return <div className="debug">{[
    `FPS ${idle ? 'idle' : metrics.fps.toFixed(0)} · ${metrics.frameTime.toFixed(1)} ms`,
    `calls ${metrics.calls} · tris ${metrics.triangles}`,
    `tex ${metrics.textures} · geo ${metrics.geometries}`,
    `DPR ${metrics.dpr.toFixed(2)} · demand`,
    `selected ${selected?.slice(0, 8) ?? 'none'}`,
    `assets ${assets.loadedAssets} · ${formatBytes(assets.byteSize)}`,
  ].join('\n')}</div>;
}
