import type { PlanningEntityId, PlanningGoal } from '../contracts';

/**
 * Internal Track B input describing ONLY the focal entities the model is
 * allowed to choose from. Deliberately excludes coordinates, dimensions,
 * collision data and any planning facts the intent interpreter does not need.
 * This type is NOT part of Contract v1 and never crosses into it.
 */
export type PlanningIntentFocalKind = 'tv';

export type PlanningIntentFocalPoint = {
  id: PlanningEntityId;
  kind: PlanningIntentFocalKind;
  label?: string;
};

export type PlanningIntentContext = {
  focalPoints: PlanningIntentFocalPoint[];
};

/**
 * Result of interpreting natural-language intent. Interpretation/model outcomes
 * are returned as values; caller/precondition mistakes throw
 * {@link PlanningIntentInputError} BEFORE any provider invocation.
 */
export type PlanningIntentResult =
  | { outcome: 'success'; goal: PlanningGoal }
  | { outcome: 'unsupported_intent' }
  | { outcome: 'ambiguous_focal'; candidateIds: PlanningEntityId[] }
  | { outcome: 'invalid_model_output'; reason: string }
  | { outcome: 'unknown_focal_id'; focalPointId: PlanningEntityId }
  | { outcome: 'provider_error'; reason: string };
