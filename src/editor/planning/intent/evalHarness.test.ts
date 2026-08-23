import { describe, expect, it } from 'vitest';
import { planningIntentEvalCases } from './evalCases';
import { formatPlanningIntentEvalReport, runPlanningIntentEvals } from './evalHarness';

describe('planning intent eval harness (deterministic fake provider only)', () => {
  it('runs the full eval corpus green with well-behaved scripted outputs', async () => {
    const report = await runPlanningIntentEvals(planningIntentEvalCases);
    expect(report.totalCases).toBe(planningIntentEvalCases.length);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.totalCases);
    expect(report.failures).toEqual([]);
    expect(Object.values(report.actualOutcomeCounts).reduce((a, b) => a + b, 0)).toBe(report.totalCases);
  });

  it('covers all required eval groups and both product languages', () => {
    const groups = new Set(planningIntentEvalCases.map((evalCase) => evalCase.group));
    expect(groups).toEqual(
      new Set([
        'default_tv',
        'viewing_first',
        'circulation_first',
        'conversation',
        'multi_focal',
        'ambiguous_focal',
        'unsupported',
        'adversarial',
      ]),
    );
    const russian = planningIntentEvalCases.filter((evalCase) => /[\u0400-\u04FF]/.test(evalCase.text));
    const english = planningIntentEvalCases.filter((evalCase) => !/[\u0400-\u04FF]/.test(evalCase.text));
    expect(russian.length).toBeGreaterThan(planningIntentEvalCases.length / 2);
    expect(english.length).toBeGreaterThanOrEqual(5);
  });

  it('reports per-case failures with expected vs actual outcome categories', async () => {
    const corrupted = planningIntentEvalCases.map((evalCase) =>
      evalCase.id === 'e1-bedroom-ru'
        ? {
            ...evalCase,
            modelOutput: { activity: 'watchTv', focalPointId: 'tv-living' },
            expected: {
              outcome: 'success',
              goal: { activity: 'watchTv', focalPointId: 'tv-bedroom' },
            } as const,
          }
        : evalCase,
    );
    const report = await runPlanningIntentEvals(corrupted);
    expect(report.failed).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      id: 'e1-bedroom-ru',
      group: 'multi_focal',
      language: 'ru',
      passed: false,
      expectedOutcome: 'success',
      actualOutcome: 'success',
    });
  });

  it('formats a human-readable report without any I/O', async () => {
    const report = await runPlanningIntentEvals(planningIntentEvalCases);
    const text = formatPlanningIntentEvalReport(report);
    expect(text).toContain(`${report.passed}/${report.totalCases} passed`);
    expect(text).toContain('Outcome counts');
  });
});
