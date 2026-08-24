import type {
  PlanningEntity as LivingRoomPlanningEntity,
  PlanningScene as LivingRoomPlanningScene,
} from '../livingRoom/PlanningScene';
export type {
  PlanningEntitySource,
  PlanningPlacementType,
  PlanningTransform,
  PlanningZone,
} from '../livingRoom/PlanningScene';

export type PlanningEntityRole = 'tv' | 'sofa' | 'armchair' | 'coffeeTable' | 'floorLamp' | 'obstacle';
export type TvRole = PlanningEntityRole;
/** Compatibility shape for existing TV fixtures and imports. */
export type PlanningEntity = Omit<LivingRoomPlanningEntity, 'role'> & { role: TvRole; fixed?: boolean };
export type PlanningScene = Omit<LivingRoomPlanningScene, 'entities'> & { entities: PlanningEntity[] };
