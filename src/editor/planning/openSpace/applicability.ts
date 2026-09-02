import { pointDistance } from '@/editor/spatial/geometry';
import { PlanningError, type PlanningEntity, type PlanningScene } from '@/editor/planning/livingRoom';

const compareLexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const movableFloor = (entity: PlanningEntity): boolean => entity.placementType === 'floor' && entity.source.kind === 'roomObject';

export type OpenSpaceActiveGroup = {
  sofa: PlanningEntity;
  armchair?: PlanningEntity;
  coffeeTable?: PlanningEntity;
  decor: PlanningEntity[];
  movable: PlanningEntity[];
};

/** Selects the bounded seating cluster and every eligible floor decor object. */
export const validateOpenSpaceApplicability = (scene: PlanningScene): OpenSpaceActiveGroup => {
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa');
  if (sofas.length !== 1) throw new PlanningError('UNSUPPORTED_LAYOUT', 'Open-space planning requires exactly one sofa');
  const sofa = sofas[0]!;
  if (!movableFloor(sofa)) throw new PlanningError('UNSUPPORTED_PLACEMENT', `Unsupported placement type for movable entity ${sofa.id}: ${sofa.placementType}`);

  const nearest = (role: string): PlanningEntity | undefined => scene.entities
    .filter((entity) => entity.role === role && movableFloor(entity))
    .sort((a, b) => pointDistance(a.transform.position, sofa.transform.position) - pointDistance(b.transform.position, sofa.transform.position)
      || compareLexical(a.id, b.id))[0];
  const armchair = nearest('armchair');
  const coffeeTable = nearest('coffeeTable');
  const decorRoles = new Set(['plant', 'floorLamp', 'rug', 'sideTable', 'console', 'floorDecor']);
  const decor = scene.entities.filter((entity) => decorRoles.has(entity.role) && movableFloor(entity))
    .sort((a, b) => compareLexical(a.id, b.id));
  const movable = [sofa, ...(armchair ? [armchair] : []), ...(coffeeTable ? [coffeeTable] : []), ...decor];
  return { sofa, armchair, coffeeTable, decor, movable };
};
