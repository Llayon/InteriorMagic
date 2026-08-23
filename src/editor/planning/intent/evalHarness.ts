import type { PlanningGoal } from '../contracts';
import type { PlanningIntentEvalCase } from './evalCases';
import { createFakePlanningIntentProvider } from './fakeProvider';
import { interpretPlanningIntent } from './interpreter';
import type { PlanningIntentProvider } from './provider';
import type { PlanningIntentResult } from './types';

export type PlanningIntentEvalLanguage = 'ru' | 'en';

export type PlanningIntentCaseReport = {
  id: string;
  group: string;
  language: PlanningIntentEvalLanguage;
  passed: boolean;
  expectedOutcome: string;
  actualOutcome: string;
};

export type PlanningIntentEvalReport = {
  totalCases: number;
  passed: number;
  failed: number;
  /** Actual outcome category counts, useful for provider behavior analysis. */
  actualOutcomeCounts: Record<string, number>;
  failures: PlanningIntentCaseReport[];
};

const detectLanguage = (text: string): PlanningIntentEvalLanguage =>
  /[\u0400-\u04FF]/.test(text) ? 'ru' : 'en';

type ProviderErrorStep = { step: 'error'; error: Error };

const isProviderErrorStep = (value: unknown): value is ProviderErrorStep => {
  if (typeof value !== 'object' || value === null || !('step' in value)) return false;
  const record = value as Record<string, unknown>;
  return record['step'] === 'error' && record['error'] instanceof Error;
};


/**
 * Outcome-category match. Reasons on non-success outcomes are provider-specific
 * free text, so only the category is compared; success additionally requires an
 * exact PlanningGoal match (activity, focalPointId, ordered priorities).
 */
const matchesExpectation = (actual: PlanningIntentResult, expected: PlanningIntentResult): boolean => {
  if (actual.outcome !== expected.outcome) return false;
  if (actual.outcome === 'success' && expected.outcome === 'success') {
    const actualGoal: PlanningGoal = actual.goal;
    const expectedGoal: PlanningGoal = expected.goal;
    return (
      actualGoal.focalPointId === expectedGoal.focalPointId &&
      JSON.stringify(actualGoal.priorities ?? null) === JSON.stringify(expectedGoal.priorities ?? null)
    );
  }
  return true;
};

const countOutcome = (counts: Record<string, number>, outcome: string): void => {
  counts[outcome] = (counts[outcome] ?? 0) + 1;
};

/**
 * Pure eval runner. Accepts the corpus and runs every case through the
 * interpreter using a deterministic scripted provider — NO network, NO live
 * model, NO environment flags. A future real-provider adapter can wrap this
 * runner from a local script; generated reports are the caller's concern and
 * are never committed.
 */
export const runPlanningIntentEvals = async (
  cases: readonly PlanningIntentEvalCase[],
): Promise<PlanningIntentEvalReport> => {
  const failures: PlanningIntentCaseReport[] = [];
  const actualOutcomeCounts: Record<string, number> = {};
  let passed = 0;

  for (const evalCase of cases) {
    let actual: PlanningIntentResult;
    try {
      const provider: PlanningIntentProvider = createFakePlanningIntentProvider(
        isProviderErrorStep(evalCase.modelOutput)
          ? { step: 'error', error: evalCase.modelOutput.error }
          : { step: 'output', value: evalCase.modelOutput },
      );
      actual = await interpretPlanningIntent(evalCase.text, evalCase.context, provider);
    } catch (error) {
      // Precondition errors must not occur inside the corpus; report as failure.
      actual = { outcome: 'invalid_model_output', reason: `Unexpected interpreter throw: ${String(error)}` };
    }

    countOutcome(actualOutcomeCounts, actual.outcome);
    const casePassed = matchesExpectation(actual, evalCase.expected);
    if (casePassed) passed += 1;
    else
      failures.push({
        id: evalCase.id,
        group: evalCase.group,
        language: detectLanguage(evalCase.text),
        passed: false,
        expectedOutcome: evalCase.expected.outcome,
        actualOutcome: actual.outcome,
      });
  }

  return {
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    actualOutcomeCounts,
    failures,
  };
};

/** Human-readable report for local scripts; pure formatting, no I/O. */
export const formatPlanningIntentEvalReport = (report: PlanningIntentEvalReport): string => {
  const lines = [
    `Planning intent eval: ${report.passed}/${report.totalCases} passed, ${report.failed} failed`,
    `Outcome counts: ${JSON.stringify(report.actualOutcomeCounts)}`,
  ];
  for (const failure of report.failures) {
    lines.push(
      `FAIL [${failure.group}/${failure.language}] ${failure.id}: expected ${failure.expectedOutcome}, got ${failure.actualOutcome}`,
    );
  }
  return lines.join('\n');
};
