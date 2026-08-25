import type { PlanningEntityId } from '../contracts';
import type { PlanningIntentFocalKind } from './types';
import { PlanningIntentInputError } from './inputError';
import type { PlanningIntentContext, PlanningIntentFocalPoint } from './types';

const supportedFocalKinds: ReadonlySet<string> = new Set<PlanningIntentFocalKind>(['tv']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type ValidatedPlanningIntentContext = {
  /**
   * Defensive deep copies of the TV focal points the provider may choose from.
   * The caller-supplied context object is never mutated or retained.
   */
  tvFocalPoints: PlanningIntentFocalPoint[];
};

const cloneFocalPoint = (focal: PlanningIntentFocalPoint): PlanningIntentFocalPoint =>
  focal.label === undefined
    ? { id: focal.id, kind: focal.kind }
    : { id: focal.id, kind: focal.kind, label: focal.label };

/**
 * Structural validation of the application-supplied IntentContext. Throws
 * PlanningIntentInputError before any provider invocation on malformed input.
 * This is separate from parsePlanningGoalV2(), which stays the structural
 * authority over model output and never inspects application state.
 */
export const validatePlanningIntentContext = (
  context: PlanningIntentContext,
): ValidatedPlanningIntentContext => {
  if (!isRecord(context) || !Array.isArray(context['focalPoints'])) {
    throw new PlanningIntentInputError('PlanningIntentContext must contain a focalPoints array');
  }

  const seenIds = new Set<PlanningEntityId>();
  const tvFocalPoints: PlanningIntentFocalPoint[] = [];

  for (const entry of context['focalPoints']) {
    if (!isRecord(entry) || typeof entry['id'] !== 'string' || typeof entry['kind'] !== 'string') {
      throw new PlanningIntentInputError('Each focal point must contain string id and kind fields');
    }
    if (entry['id'].trim().length === 0) {
      throw new PlanningIntentInputError('Focal point IDs must be non-empty');
    }
    if (seenIds.has(entry['id'])) {
      throw new PlanningIntentInputError(`Duplicate focal point ID: ${entry['id']}`);
    }
    seenIds.add(entry['id']);
    if (!supportedFocalKinds.has(entry['kind'])) {
      throw new PlanningIntentInputError(`Unsupported focal point kind: ${entry['kind']}`);
    }
    if (entry['label'] !== undefined && typeof entry['label'] !== 'string') {
      throw new PlanningIntentInputError(`Focal point label must be a string when provided: ${entry['id']}`);
    }

    const focal: PlanningIntentFocalPoint =
      entry['label'] === undefined
        ? { id: entry['id'], kind: entry['kind'] as PlanningIntentFocalKind }
        : { id: entry['id'], kind: entry['kind'] as PlanningIntentFocalKind, label: entry['label'] };
    tvFocalPoints.push(cloneFocalPoint(focal));
  }

  return { tvFocalPoints };
};
