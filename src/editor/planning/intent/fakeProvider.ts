import type {
  PlanningIntentProvider,
  PlanningIntentProviderRequest,
} from './provider';

export type FakeProviderStep =
  | { step: 'output'; value: unknown }
  | { step: 'error'; error: Error };

export type FakePlanningIntentProvider = PlanningIntentProvider & {
  /** Requests received so far — lets tests assert exactly what left the app. */
  readonly requests: readonly PlanningIntentProviderRequest[];
};

/**
 * Deterministic, network-free provider for tests and evals. Steps are consumed
 * in order; once exhausted, the last step repeats. Supports injecting valid
 * raw goals, malformed objects, hostile payloads, sentinels and thrown errors.
 */
export const createFakePlanningIntentProvider = (
  ...steps: FakeProviderStep[]
): FakePlanningIntentProvider => {
  if (steps.length === 0) {
    throw new Error('createFakePlanningIntentProvider requires at least one step');
  }

  const requests: PlanningIntentProviderRequest[] = [];
  let cursor = 0;

  return {
    requests,
    async interpret(request: PlanningIntentProviderRequest): Promise<unknown> {
      requests.push({
        userText: request.userText,
        focalPoints: request.focalPoints.map((focal) => ({ ...focal })),
      });
      const index = Math.min(cursor, steps.length - 1);
      cursor += 1;
      const step = steps[index];
      if (step === undefined) throw new Error('Fake provider has no steps');
      if (step.step === 'error') throw step.error;
      return step.value;
    },
  };
};
