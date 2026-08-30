import { useEditorStore } from '@/editor/state/store';
import { usePlannerStore, type PlannerOrchestrator } from '@/editor/planning/ui';

/**
 * Top-right entry point for the planner UX.
 *
 * Renders whenever the application supplies a currently applicable planner.
 * Capability derivation remains outside this presentation component.
 *
 * The orchestrator surface is generic — this component never knows which
 * implementation is driving analysis.
 */
export function PlannerEntryButton({
  orchestrator,
  label,
}: {
  orchestrator: PlannerOrchestrator;
  label: string;
}) {
  const status = usePlannerStore((state) => state.status);
  const openSheet = () => {
    useEditorStore.getState().setWorkspacePanel('planner');
    useEditorStore.getState().setSheetState('expanded');
  };
  const disabled = status === 'loading';
  return (
    <button
      className="planner-entry"
      data-testid="planner-entry"
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        openSheet();
        // Orchestrator owns its supersession token and the target-existence
        // resolver. The presentation layer does not import useEditorStore
        // for validation.
        void orchestrator.beginAnalysis();
      }}
    >
      <span className="sparkle" aria-hidden="true">✦</span>
      <span className="planner-entry-label">{label}</span>
    </button>
  );
}
