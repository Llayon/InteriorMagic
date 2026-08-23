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
import { createRealPlannerOrchestrator } from '@/editor/planning/integration';

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

  // Fixture mode remains explicit and build-gated. The real deterministic
  // planner is the normal application path and never depends on this flag.
  const requestedFixture = PLANNER_FIXTURE_HARNESS_ENABLED
    ? parsePlannerFixture(window.location.search)
    : null;
  const storeShim = {
    beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
    receiveProposal: (p: PlanProposal) => usePlannerStore.getState().receiveProposal(p),
    failAnalysis: (e: string) => usePlannerStore.getState().failAnalysis(e),
  };
  let plannerOrchestrator: PlannerOrchestrator;
  let plannerSource: 'real' | 'fixture';
  if (requestedFixture) {
    const resolvePlannerTargets = createLiveProjectTargetResolver(() => useEditorStore.getState().project);
    plannerOrchestrator = requestedFixture === 'error'
      ? createErrorOrchestrator(storeShim)
      : createFixtureOrchestrator(requestedFixture, storeShim, resolvePlannerTargets);
    plannerSource = 'fixture';
    useEditorStore.setState({ project: createPlannerFixtureProject() });
    usePlannerStore.getState().reset();
  } else {
    if (import.meta.env.MODE === 'test') {
      const requestedRoom = query.get('planning-test-room');
      if (requestedRoom === 'improved' || requestedRoom === 'already-good' || requestedRoom === 'no-tv') {
        const { createPlannerIntegrationProject, installPlannerIntegrationTestAssets } = await import('@/app/demo/plannerIntegrationRoom');
        installPlannerIntegrationTestAssets();
        useEditorStore.setState({ project: createPlannerIntegrationProject(requestedRoom) });
      }
    }
    plannerOrchestrator = createRealPlannerOrchestrator({
      readProject: () => useEditorStore.getState().project,
      store: storeShim,
      applyMoves: (moves, fingerprint) => useEditorStore.getState().applyPlanningMovesAtomic(moves, fingerprint),
      beforeAnalysis: import.meta.env.MODE === 'test' && query.get('planning-delay') === '1'
        ? () => new Promise((resolve) => window.setTimeout(resolve, 320))
        : undefined,
    });
    plannerSource = 'real';
  }

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <App plannerOrchestrator={plannerOrchestrator} plannerSource={plannerSource} />
    </StrictMode>
  );
};

void bootstrap().catch((error: unknown) => {
  console.error('InteriorMagic bootstrap failed', error);
});
