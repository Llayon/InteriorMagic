export type PlannerApplyFailureReason = 'stale' | 'missing-target' | 'invalid-proposal' | 'invalid-final-layout';
export type PlannerApplyResult = { ok: true } | { ok: false; reason: PlannerApplyFailureReason };

/** Application boundary shared by presentation, fixtures and real planning. */
export interface PlannerOrchestrator {
  beginAnalysis(): Promise<void>;
  cancelPending(): void;
  applyCurrentProposal?(): PlannerApplyResult;
}
