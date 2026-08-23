import { useEditorStore } from '@/editor/state/store';
import { usePlannerStore, type PlannerOrchestrator } from '@/editor/planning/ui';
import { PlannerEntryButton } from './planner/PlannerEntryButton';

export function Toolbar({
  orchestrator = null,
  entryLabel = '',
}: {
  orchestrator?: PlannerOrchestrator | null;
  entryLabel?: string;
}) {
  const selected = useEditorStore((state) => state.session.selectedId);
  const undo = useEditorStore((state) => state.session.undoStack.length);
  const redo = useEditorStore((state) => state.session.redoStack.length);
  const isPreviewing = usePlannerStore((state) => state.isPreviewing);
  return (
    <>
      <div className="global-toolbar glass" data-testid="global-toolbar">
        {orchestrator && <PlannerEntryButton orchestrator={orchestrator} label={entryLabel} />}
        <button
          aria-label="Undo"
          data-testid="toolbar-undo"
          disabled={!undo || isPreviewing}
          onClick={() => useEditorStore.getState().undo()}
        >↶</button>
        <button
          aria-label="Redo"
          data-testid="toolbar-redo"
          disabled={!redo || isPreviewing}
          onClick={() => useEditorStore.getState().redo()}
        >↷</button>
        <button
          aria-label="Fit Room"
          data-testid="toolbar-fit-room"
          onClick={() => useEditorStore.getState().requestFitRoom()}
        >⌂</button>
      </div>
      {selected && (
        <div className="object-toolbar glass" data-testid="object-toolbar">
          <button
            aria-label="Rotate left"
            data-testid="toolbar-rotate-left"
            disabled={isPreviewing}
            onClick={() => useEditorStore.getState().rotate(selected, -1)}
          >↺</button>
          <button
            aria-label="Rotate right"
            data-testid="toolbar-rotate-right"
            disabled={isPreviewing}
            onClick={() => useEditorStore.getState().rotate(selected, 1)}
          >↻</button>
          <button
            aria-label="Duplicate"
            data-testid="toolbar-duplicate"
            disabled={isPreviewing}
            onClick={() => useEditorStore.getState().duplicate(selected)}
          >⧉</button>
          <button
            className="danger"
            aria-label="Delete"
            data-testid="toolbar-delete"
            disabled={isPreviewing}
            onClick={() => useEditorStore.getState().remove(selected)}
          >×</button>
        </div>
      )}
    </>
  );
}
