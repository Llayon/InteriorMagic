import { create } from 'zustand';
import type { ProposedMove, PlanProposal } from '../contracts';

/**
 * Generic Planner UI state — orchestrator-agnostic.
 *
 * Holds ONLY UX state: status (idle|loading|ready|error), the active proposal,
 * and the read-only preview flag. No fixture IDs, no artificial delays, no
 * loader registration — those belong to a separate `installPlannerHarness()`
 * layer that drives this store via `receiveProposal()` / `failAnalysis()`.
 *
 * This split is what lets a real planner (Track A / Integration 1) replace
 * the dev harness without touching the UI store or its consumers.
 */

export type PlannerUiStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlannerUiStore {
  status: PlannerUiStatus;
  proposal: PlanProposal | null;
  error: string | null;
  /**
   * Read-only preview is a separate boolean state — NOT a status. Preview is
   * a render-time visual overlay that requires `status === 'ready'` AND an
   * `isPreviewing === true` flag. Cancelling preview simply flips the flag.
   */
  isPreviewing: boolean;
  /**
   * Begin analysis. Transitions UI to `loading`. The orchestrator (real
   * planner or dev harness) is responsible for resolving the analysis and
   * calling `receiveProposal()` or `failAnalysis()`.
   */
  beginAnalysis(): void;
  /** Receive a resolved proposal from the orchestrator. UI → `ready`. */
  receiveProposal(proposal: PlanProposal): void;
  /** Receive an error from the orchestrator. UI → `error`. */
  failAnalysis(error: string): void;
  /** Enter the temporary 3D preview rendering mode. No editor mutation. */
  enterPreview(): void;
  /** Exit preview and restore normal rendering. No editor mutation. */
  exitPreview(): void;
  /** Reset all planner state to idle. No editor mutation. */
  reset(): void;
}

export const usePlannerStore = create<PlannerUiStore>((set, get) => ({
  status: 'idle',
  proposal: null,
  error: null,
  isPreviewing: false,
  beginAnalysis() {
    set({ status: 'loading', proposal: null, error: null, isPreviewing: false });
  },
  receiveProposal(proposal) {
    set({ status: 'ready', proposal, error: null, isPreviewing: false });
  },
  failAnalysis(error) {
    set({ status: 'error', error, proposal: null, isPreviewing: false });
  },
  enterPreview() {
    if (get().status !== 'ready') return;
    set({ isPreviewing: true });
  },
  exitPreview() {
    set({ isPreviewing: false });
  },
  reset() {
    set({ status: 'idle', proposal: null, error: null, isPreviewing: false });
  },
}));

/**
 * Compute the preview transform override for an instance, if any.
 * Returns null if no preview override applies (preview inactive or no matching move).
 *
 * This selector is intentionally read-only — it must NEVER mutate the editor
 * store, RoomProject, undo/redo stack, or any persistent state. Callers apply
 * the returned override directly to the THREE group at render time only.
 */
export const selectPreviewOverride = (
  state: PlannerUiStore,
  instanceId: string,
): ProposedMove | null => {
  if (!state.isPreviewing || state.status !== 'ready' || !state.proposal) return null;
  return state.proposal.moves.find((move) => move.instanceId === instanceId) ?? null;
};
