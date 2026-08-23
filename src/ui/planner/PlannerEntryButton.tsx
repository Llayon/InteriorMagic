import { useEditorStore } from '@/editor/state/store';
import { usePlannerStore, type PlannerOrchestrator } from '@/editor/planning/ui';

/**
 * Top-right entry point for the planner UX.
 *
 * Only renders when a fixture URL flag is active AND the build-time
 * harness flag is enabled. Hidden in normal mode so end users never see a
 * fake "Improve layout" affordance.
 *
 * The orchestrator surface is generic — this component never knows which
 * fixture (or real planner) is driving analysis.
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
      <span>{label}</span>
    </button>
  );
}
