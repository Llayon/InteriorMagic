import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initTelegram } from '@/telegram/telegram';
import '@/app/styles.css';
import { installTestDiagnostics } from '@/test/diagnostics';
import { createBeautifulRoomProject } from '@/app/demo/beautifulRoom';
import { createPlannerFixtureProject } from '@/app/demo/plannerFixtureRoom';
import { useEditorStore } from '@/editor/state/store';
import {
  parsePlannerFixture,
  PLANNER_FIXTURE_HARNESS_ENABLED,
  createFixtureOrchestrator,
  createErrorOrchestrator,
  usePlannerStore,
  type PlannerOrchestrator,
  createLiveProjectTargetResolver,
} from '@/editor/planning/ui';
import type { PlanProposal } from '@/editor/planning/contracts';

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

  // Planner harness is explicit opt-in via build-time env flag. Without
  // VITE_PLANNER_FIXTURE_HARNESS_ENABLED=true the planner UX is dormant:
  // no entry button, no fixture room, no override of RoomProject. The
  // ?planning-fixture=… query parameter is silently ignored so production
  // traffic cannot accidentally trip the harness.
  const requestedFixture = PLANNER_FIXTURE_HARNESS_ENABLED
    ? parsePlannerFixture(window.location.search)
    : null;
  let plannerOrchestrator: PlannerOrchestrator | null = null;
  if (requestedFixture) {
    const storeShim = {
      beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
      receiveProposal: (p: PlanProposal) => usePlannerStore.getState().receiveProposal(p),
      failAnalysis: (e: string) => usePlannerStore.getState().failAnalysis(e),
    };
    // Resolver hoisted to the bootstrap / integration boundary. The real
    // planner integration will supply its own resolver reading from the live
    // editor scene. The presentation layer (PlannerEntryButton,
    // PlannerPanel) never imports useEditorStore for validation.
    const resolvePlannerTargets = createLiveProjectTargetResolver(() => useEditorStore.getState().project);
    plannerOrchestrator = requestedFixture === 'error'
      ? createErrorOrchestrator(storeShim)
      : createFixtureOrchestrator(requestedFixture, storeShim, resolvePlannerTargets);
    useEditorStore.setState({ project: createPlannerFixtureProject() });
    usePlannerStore.getState().reset();
  }

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <App plannerOrchestrator={plannerOrchestrator} />
    </StrictMode>
  );
};

void bootstrap().catch((error: unknown) => {
  console.error('InteriorMagic bootstrap failed', error);
});
