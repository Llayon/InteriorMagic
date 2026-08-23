import { Canvas } from '@react-three/fiber';
import { useSyncExternalStore } from 'react';
import { getAsset } from '@/editor/assets/registry';
import { AssetModel } from '@/scene/assets/AssetModel';
import { assetCache } from '@/scene/assets/AssetCache';

export function IthappyThumbnailView({ assetId }: { assetId: string }) {
  const asset = getAsset(assetId);
  const revision = useSyncExternalStore(assetCache.subscribe, assetCache.getRevision, assetCache.getRevision);
  void revision;
  const ready = assetCache.get(assetId)?.status === 'ready';
  const targetY = asset.dimensions.height / 2;
  const distance = Math.max(asset.dimensions.width, asset.dimensions.height, asset.dimensions.depth) * 2.15;
  return <main data-testid="thumbnail-renderer" data-ready={ready ? 'true' : 'false'} style={{ width: '100vw', height: '100vh', background: '#eee9e1' }}>
    <Canvas frameloop="demand" dpr={1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 38, near: .01, far: 100, position: [distance * .72, targetY + distance * .48, distance * .72] }} onCreated={({ camera }) => camera.lookAt(0, targetY, 0)}>
      <color attach="background" args={['#eee9e1']} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[4, 7, 5]} intensity={1.4} />
      <AssetModel assetId={assetId} variantId="source" fallback={null} />
    </Canvas>
  </main>;
}
