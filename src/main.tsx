import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initTelegram } from '@/telegram/telegram';
import '@/app/styles.css';
import { installTestDiagnostics } from '@/test/diagnostics';
import { createBeautifulRoomProject } from '@/app/demo/beautifulRoom';
import { useEditorStore } from '@/editor/state/store';
initTelegram();
installTestDiagnostics();
const bootstrap = async () => {
  const query = new URLSearchParams(window.location.search);
  if (import.meta.env.MODE === 'test' && query.get('registry') === 'ithappy') {
    const { installIthappyRegistryPrototype } = await import('@/app/local/ithappyRegistryPrototype');
    await installIthappyRegistryPrototype();
  }
  if (query.get('registry') === 'ithappy-remote') {
    const { resolveIthappyRemotePreviewOrigin } = await import('@/app/local/ithappyRemotePreview');
    const remotePreviewOrigin = resolveIthappyRemotePreviewOrigin(window.location.search, {
      enabled: import.meta.env.VITE_ITHAPPY_REMOTE_PREVIEW_ENABLED,
      assetOrigin: import.meta.env.VITE_ITHAPPY_ASSET_ORIGIN,
      placementMetadataUrl: import.meta.env.VITE_ITHAPPY_PREVIEW_PLACEMENT_URL,
    });
    if (remotePreviewOrigin) {
      const { installIthappyRemoteRegistryPrototype } = await import('@/app/local/ithappyRegistryPrototype');
      await installIthappyRemoteRegistryPrototype(remotePreviewOrigin.assetOrigin, remotePreviewOrigin.placementMetadataUrl);
    }
  }
  const thumbnailAssetId = import.meta.env.MODE === 'test' && query.get('thumbnail') === 'ithappy' ? query.get('asset') : null;
  if (thumbnailAssetId) {
    const { IthappyThumbnailView } = await import('@/app/local/IthappyThumbnailView');
    createRoot(document.getElementById('root')!).render(<IthappyThumbnailView assetId={thumbnailAssetId} />);
    return;
  }
  if (query.get('demo') === '1') useEditorStore.setState({ project: createBeautifulRoomProject() });
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
};

void bootstrap().catch((error: unknown) => {
  console.error('InteriorMagic bootstrap failed', error);
});
