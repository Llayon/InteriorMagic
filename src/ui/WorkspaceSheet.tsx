import { useRef, type PointerEvent } from 'react';
import { useEditorStore } from '@/editor/state/store';
import { Catalog } from './Catalog';
import { Finishes } from './Finishes';
import { PlannerPanel } from './planner/PlannerPanel';
import type { PlannerOrchestrator } from '@/editor/planning/ui';

export function WorkspaceSheet({
  plannerOrchestrator,
  onPlannerExit,
}: {
  plannerOrchestrator: PlannerOrchestrator | null;
  onPlannerExit: () => void;
}) {
  const panel = useEditorStore((state) => state.session.workspacePanel);
  const sheetState = useEditorStore((state) => state.session.sheetState);
  const startY = useRef<number | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => { startY.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const delta = startY.current === null ? 0 : event.clientY - startY.current;
    startY.current = null;
    const store = useEditorStore.getState();
    if (delta < -36) store.setSheetState('expanded');
    else if (delta > 36) store.setSheetState(sheetState === 'expanded' ? 'peek' : 'closed');
    else store.setSheetState(sheetState === 'expanded' ? 'peek' : 'expanded');
  };
  // When the planner UX is open, hide the catalog/materials tabs so the panel
  // is dedicated to the proposal surface. The planner is a distinct session
  // panel — it does not inherit the catalog tab identity.
  const plannerActive = panel === 'planner';
  return (
    <aside className="workspace-sheet" data-testid="workspace-sheet" data-sheet-state={sheetState} data-workspace-panel={panel ?? 'none'} onPointerDown={(event) => event.stopPropagation()}>
      <button className="sheet-handle" aria-label={sheetState === 'expanded' ? 'Collapse panel' : 'Expand panel'} onPointerDown={onPointerDown} onPointerUp={onPointerUp}><span /></button>
      {!plannerActive && (
        <nav className="workspace-tabs" aria-label="Workspace panels">
          <button className={panel === 'catalog' ? 'active' : ''} aria-label="Catalog" onClick={() => { const store = useEditorStore.getState(); store.setWorkspacePanel('catalog'); if (store.session.sheetState === 'closed') store.setSheetState('peek'); }}>Мебель</button>
          <button className={panel === 'materials' ? 'active' : ''} aria-label="Materials" onClick={() => { const store = useEditorStore.getState(); store.setWorkspacePanel('materials'); store.setSheetState('expanded'); }}>Материалы</button>
        </nav>
      )}
      <div className="sheet-content">
        {plannerActive && plannerOrchestrator ? (
          <PlannerPanel orchestrator={plannerOrchestrator} onExit={onPlannerExit} />
        ) : panel === 'materials' ? (
          <Finishes />
        ) : (
          <Catalog />
        )}
      </div>
    </aside>
  );
}
