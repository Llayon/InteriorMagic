export type {
  PlanningEntity,
  PlanningEntityRole,
  PlanningEntitySource,
  PlanningPlacementType,
  PlanningRole,
  PlanningScene,
  PlanningTransform,
  PlanningZone,
} from './PlanningScene';
export { PlanningError } from '../errors';
export type { PlanningErrorCode } from '../errors';
export {
  activeTransform,
  roomObjectInstanceId,
  runLivingRoomLayout,
} from './engine';
export type {
  ActiveGroup,
  Arrangement,
  Candidate,
  CandidateDimension,
  LayoutDiagnostics,
  LayoutPlanRequest,
  LayoutPlanResult,
  LayoutQuality,
  LayoutMovementMetrics,
  LayoutSelectionPolicy,
  LayoutSelection,
  LayoutSearchLimits,
  RuleEvaluation,
  SelectionOutcome,
} from './engine';
