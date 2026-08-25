import { parsePlanningGoalV2 } from '../contracts';
import type { PlanningGoalV2 } from '../contracts';
import { validatePlanningIntentContext } from './context';
import { PlanningIntentInputError } from './inputError';
import type { PlanningIntentProvider, PlanningIntentProviderRequest } from './provider';
import type { PlanningIntentContext, PlanningIntentResult } from './types';

/** Reasonable hygiene cap; user text is never truncated silently. */
export const MAX_PLANNING_INTENT_TEXT_LENGTH = 2000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeUserText = (rawUserText: string): string => {
  if (typeof rawUserText !== 'string') {
    throw new PlanningIntentInputError('User request text must be a string');
  }
  const userText = rawUserText.trim();
  if (userText.length === 0) {
    throw new PlanningIntentInputError('User request text must not be empty');
  }
  if (userText.length > MAX_PLANNING_INTENT_TEXT_LENGTH) {
    throw new PlanningIntentInputError(
      `User request text exceeds the maximum length of ${MAX_PLANNING_INTENT_TEXT_LENGTH} characters`,
    );
  }
  return userText;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Provider-neutral natural-language intent interpreter.
 *
 * Caller/precondition mistakes throw PlanningIntentInputError BEFORE the
 * provider is invoked. Everything downstream of a successful invocation —
 * provider failures, malformed model output, invented focal IDs — is returned
 * as a typed PlanningIntentResult value; no exception escapes this boundary.
 *
 * The provider output is treated as untrusted external input:
 * 1. Track B sentinels ({intent: ...}) are recognized only as single-field
 *    objects;
 * 2. everything else must pass parsePlanningGoalV2() (structural authority,
 *    unknown fields strictly rejected);
 * 3. focalPointId must then exist exactly once among the TV focal points
 *    explicitly supplied in the IntentContext (contextual validation).
 */
export const interpretPlanningIntent = async (
  rawUserText: string,
  context: PlanningIntentContext,
  provider: PlanningIntentProvider,
): Promise<PlanningIntentResult> => {
  const userText = normalizeUserText(rawUserText);
  const validated = validatePlanningIntentContext(context);

  // Only minimal intent context leaves the application: trimmed text plus
  // allowed focal IDs/kinds/labels. No RoomProject, no PlanningScene, no
  // geometry, no catalog data ever reaches the provider.
  const request: PlanningIntentProviderRequest = {
    userText,
    focalPoints: validated.tvFocalPoints.map((focal) => ({ ...focal })),
  };

  let providerOutput: unknown;
  try {
    providerOutput = await provider.interpret(request);
  } catch (error) {
    return { outcome: 'provider_error', reason: describeError(error) };
  }

  if (isRecord(providerOutput) && 'intent' in providerOutput) {
    if (Object.keys(providerOutput).length !== 1 || typeof providerOutput['intent'] !== 'string') {
      return {
        outcome: 'invalid_model_output',
        reason: 'Sentinel response must contain exactly one string field "intent"',
      };
    }
    if (providerOutput['intent'] === 'unsupported_intent') {
      return { outcome: 'unsupported_intent' };
    }
    if (providerOutput['intent'] === 'ambiguous_focal') {
      return {
        outcome: 'ambiguous_focal',
        candidateIds: validated.tvFocalPoints.map((focal) => focal.id),
      };
    }
    return {
      outcome: 'invalid_model_output',
      reason: `Unknown intent sentinel: ${providerOutput['intent']}`,
    };
  }

  let goal: PlanningGoalV2;
  try {
    goal = parsePlanningGoalV2(providerOutput);
  } catch (error) {
    return { outcome: 'invalid_model_output', reason: describeError(error) };
  }

  switch (goal.activity) {
    case 'watchTv': {
      const matches = validated.tvFocalPoints.filter((focal) => focal.id === goal.focalPointId);
      const match = matches[0];
      if (matches.length !== 1 || match === undefined || match.kind !== 'tv') {
        return { outcome: 'unknown_focal_id', focalPointId: goal.focalPointId };
      }
      return { outcome: 'success', goal };
    }
    case 'conversation':
      return { outcome: 'success', goal };
    default: {
      const unreachable: never = goal;
      return unreachable;
    }
  }
};
