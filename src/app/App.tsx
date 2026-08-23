import { useCallback, useMemo, useRef } from 'react';
import { SceneCanvas } from '@/scene/SceneCanvas';
import { DebugOverlay } from '@/scene/debug/DebugOverlay';
import { Toolbar } from '@/ui/Toolbar';
import { WorkspaceSheet } from '@/ui/WorkspaceSheet';
import { ProjectMenu } from '@/ui/ProjectMenu';
import { isDebugEnabled } from '@/shared/debug';
import { useEditorStore } from '@/editor/state/store';
import { useWorkspaceGeometry } from './useWorkspaceGeometry';
import { usePlannerStore, type PlannerOrchestrator } from '@/editor/planning/ui';

export function App({
  plannerOrchestrator = null,
  entryLabel = 'Улучшить расстановку',
}: {
  plannerOrchestrator?: PlannerOrchestrator | null;
  entryLabel?: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const sheetState = useEditorStore((state) => state.session.sheetState);
  const geometry = useWorkspaceGeometry(rootRef, sheetState);
  // When planner preview is active, dim the project menu interaction so users
  // cannot accidentally start a destructive flow while the room is in a
  // read-only preview state.
  const isPreviewing = usePlannerStore((state) => state.isPreviewing);
  const plannerReady = useMemo(() => Boolean(plannerOrchestrator), [plannerOrchestrator]);

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

  return (
    <main
      ref={rootRef}
      data-testid="app-root"
      data-sheet-state={sheetState}
      data-planner-harness={plannerReady ? 'on' : 'off'}
      data-planner-previewing={isPreviewing ? 'on' : 'off'}
    >
      <div className="safe-area-probe" aria-hidden="true" />
      <header data-testid="app-header">
        <div><small>INTERIOR MAGIC</small><h1>Моя комната</h1></div>
        <ProjectMenu disabled={isPreviewing} />
      </header>
      <div className="scene" data-testid="scene">
        <SceneCanvas workspace={geometry} />
        <div className="hint">Перетаскивайте мебель одним пальцем</div>
        <Toolbar orchestrator={plannerReady ? plannerOrchestrator : null} entryLabel={entryLabel} />
        {isDebugEnabled && <DebugOverlay />}
      </div>
      <WorkspaceSheet
        plannerOrchestrator={plannerReady ? plannerOrchestrator : null}
        onPlannerExit={onPlannerExit}
      />
    </main>
  );
}
