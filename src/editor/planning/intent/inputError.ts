/**
 * Thrown for caller/precondition mistakes BEFORE any provider invocation:
 * empty or oversized request text, malformed context, blank/duplicate focal
 * IDs, unsupported focal kinds, or zero usable TV focal points.
 *
 * Interpretation/model failures are NOT thrown; they are returned as
 * {@link PlanningIntentResult} values so no exception escapes the
 * interpretation boundary past input validation.
 */
export class PlanningIntentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningIntentInputError';
  }
}
