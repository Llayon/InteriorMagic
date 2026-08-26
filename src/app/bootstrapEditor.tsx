import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { installTestDiagnostics, registerPlanningIntentAnalysisPort } from '@/test/diagnostics';
import { initIdentity } from '@/platform/identity/client';
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
import {
  createRealPlannerOrchestrator,
  createRemotePlanningIntentProvider,
  type PlanningIntentAnalysisPort,
} from '@/editor/planning/integration';

export const bootstrapEditor = async () => {
  initIdentity();
  installTestDiagnostics();
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

  const requestedFixture = PLANNER_FIXTURE_HARNESS_ENABLED
    ? parsePlannerFixture(window.location.search)
    : null;
  const storeShim = {
    beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
    receiveProposal: (proposal: PlanProposal) => usePlannerStore.getState().receiveProposal(proposal),
    failAnalysis: (error: string) => usePlannerStore.getState().failAnalysis(error),
  };
  let plannerOrchestrator: PlannerOrchestrator;
  let planningIntentAnalysisPort: PlanningIntentAnalysisPort | null = null;
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
    const intentEndpoint = import.meta.env.VITE_PLANNING_INTENT_ENDPOINT?.trim();
    const realOrchestrator = createRealPlannerOrchestrator({
      readProject: () => useEditorStore.getState().project,
      store: storeShim,
      applyMoves: (moves, fingerprint) => useEditorStore.getState().applyPlanningMovesAtomic(moves, fingerprint),
      beforeAnalysis: import.meta.env.MODE === 'test' && query.get('planning-delay') === '1'
        ? () => new Promise((resolve) => window.setTimeout(resolve, 320))
        : undefined,
      createIntentProvider: intentEndpoint
        ? (signal) => createRemotePlanningIntentProvider({ endpoint: intentEndpoint, signal })
        : undefined,
    });
    plannerOrchestrator = realOrchestrator;
    planningIntentAnalysisPort = intentEndpoint ? realOrchestrator : null;
    plannerSource = 'real';
  }

  registerPlanningIntentAnalysisPort(planningIntentAnalysisPort);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App plannerOrchestrator={plannerOrchestrator} plannerSource={plannerSource} />
    </StrictMode>,
  );
};
