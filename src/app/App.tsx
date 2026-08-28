import { useCallback, useMemo, useRef } from 'react';
import { SceneCanvas } from '@/scene/SceneCanvas';
import { DebugOverlay } from '@/scene/debug/DebugOverlay';
import { Toolbar } from '@/ui/Toolbar';
import { WorkspaceSheet } from '@/ui/WorkspaceSheet';
import { ProjectMenu } from '@/ui/ProjectMenu';
import { isDebugEnabled } from '@/shared/debug';
import { isDeviceQaEnabled } from '@/shared/deviceQa';
import { DeviceQaOverlay } from '@/deviceqa/DeviceQaOverlay';
import { useEditorStore } from '@/editor/state/store';
import { useWorkspaceGeometry } from './useWorkspaceGeometry';
import { usePlannerStore, type PlannerOrchestrator } from '@/editor/planning/ui';
import { resolveTvPlannerCapability } from '@/editor/planning/integration';

export function App({
  plannerOrchestrator = null,
  plannerSource = null,
  entryLabel = 'Улучшить расстановку',
}: {
  plannerOrchestrator?: PlannerOrchestrator | null;
  plannerSource?: 'real' | 'fixture' | null;
  entryLabel?: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const sheetState = useEditorStore((state) => state.session.sheetState);
  const project = useEditorStore((state) => state.project);
  const geometry = useWorkspaceGeometry(rootRef, sheetState);
  // When planner preview is active, dim the project menu interaction so users
  // cannot accidentally start a destructive flow while the room is in a
  // read-only preview state.
  const isPreviewing = usePlannerStore((state) => state.isPreviewing);
  const plannerReady = useMemo(() => Boolean(plannerOrchestrator), [plannerOrchestrator]);
  const plannerCapable = useMemo(
    () => plannerSource === 'fixture' || (plannerSource === 'real' && resolveTvPlannerCapability(project).available),
    [plannerSource, project],
  );
  const exposedPlanner = plannerReady && plannerCapable ? plannerOrchestrator : null;

  // Explicit planner exit: cancel any in-flight orchestrator work FIRST so a
  // stale receiveProposal() cannot resurrect a proposal after the panel
  // closes, then reset the planner UI state, then restore the workspace
  // chrome to catalog + peek.
  const onPlannerExit = useCallback(() => {
    if (plannerOrchestrator) plannerOrchestrator.cancelPending();
    usePlannerStore.getState().reset();
    const store = useEditorStore.getState();
    store.setWorkspacePanel('catalog');
    store.setSheetState('peek');
  }, [plannerOrchestrator]);

  const onPlannerApplied = useCallback(() => {
    usePlannerStore.getState().reset();
    const store = useEditorStore.getState();
    store.setWorkspacePanel('catalog');
    store.setSheetState('peek');
  }, []);

  return (
    <main
      ref={rootRef}
      data-testid="app-root"
      data-sheet-state={sheetState}
      data-planner-enabled={plannerReady ? 'on' : 'off'}
      data-planner-source={plannerSource ?? 'none'}
      data-planner-capable={plannerCapable ? 'on' : 'off'}
      data-planner-previewing={isPreviewing ? 'on' : 'off'}
      data-instance-count={project.objects.length}
    >
      <div className="safe-area-probe" aria-hidden="true" />
      <header data-testid="app-header">
        <div><small>INTERIOR MAGIC</small><h1>Моя комната</h1></div>
        <ProjectMenu disabled={isPreviewing} />
      </header>
      <div className="scene" data-testid="scene">
        <SceneCanvas workspace={geometry} />
        <div className="hint">Перетаскивайте мебель одним пальцем</div>
        <Toolbar orchestrator={exposedPlanner} entryLabel={entryLabel} />
        {isDebugEnabled && <DebugOverlay />}
        {isDeviceQaEnabled && <DeviceQaOverlay />}
      </div>
      <WorkspaceSheet
        plannerOrchestrator={exposedPlanner}
        onPlannerExit={onPlannerExit}
        onPlannerApplied={onPlannerApplied}
      />
    </main>
  );
}
