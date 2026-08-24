import type {
  PlanningEntity as LivingRoomPlanningEntity,
  PlanningScene as LivingRoomPlanningScene,
} from '../livingRoom/PlanningScene';
export type {
  PlanningEntitySource,
  PlanningEntityRole,
  PlanningPlacementType,
  PlanningTransform,
  PlanningZone,
} from '../livingRoom/PlanningScene';

/** Compatibility shape for existing TV fixtures and imports. */
export type PlanningEntity = LivingRoomPlanningEntity & { fixed?: boolean };
export type PlanningScene = Omit<LivingRoomPlanningScene, 'entities'> & { entities: PlanningEntity[] };
