export type PlanningErrorCode =
  | 'INVALID_PROJECT'
  | 'UNKNOWN_ASSET'
  | 'UNSUPPORTED_PLACEMENT'
  | 'UNSUPPORTED_LAYOUT'
  | 'FOCAL_NOT_FOUND'
  | 'FOCAL_AMBIGUOUS'
  | 'INVALID_SCENE'
  | 'INVALID_ACTIVE_GROUP'
  | 'CURRENT_LAYOUT_INVALID'
  | 'NO_VALID_PLAN'
  | 'SEARCH_LIMIT_EXCEEDED';

export class PlanningError extends Error {
  constructor(public readonly code: PlanningErrorCode, message: string) {
    super(message);
    this.name = 'PlanningError';
  }
}
