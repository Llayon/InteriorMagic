import { pointDistance } from '@/editor/spatial/geometry';
import { PlanningError, type PlanningEntity, type PlanningScene } from '@/editor/planning/livingRoom';

const compareLexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export type ConversationActiveGroup = {
  sofa: PlanningEntity;
  armchairs: PlanningEntity[];
};

/** Conversation v1 requires one floor sofa and at least one floor armchair. */
export const validateConversationApplicability = (scene: PlanningScene): ConversationActiveGroup => {
  const sofas = scene.entities.filter((entity) => entity.role === 'sofa');
  const armchairs = scene.entities.filter((entity) => entity.role === 'armchair');
  if (sofas.length !== 1 || armchairs.length === 0) {
    throw new PlanningError('UNSUPPORTED_LAYOUT', 'Conversation planning requires one sofa and at least one armchair');
  }
  const sofa = sofas[0]!;
  if (sofa.placementType !== 'floor') {
    throw new PlanningError('UNSUPPORTED_PLACEMENT', `Unsupported placement type for movable entity ${sofa.id}: ${sofa.placementType}`);
  }
  if (sofa.source.kind !== 'roomObject') {
    throw new PlanningError('INVALID_ACTIVE_GROUP', `Movable entity ${sofa.id} must originate from a room object`);
  }
  const selectedArmchairs = [...armchairs]
    .sort((a, b) => pointDistance(a.transform.position, sofa.transform.position) - pointDistance(b.transform.position, sofa.transform.position)
      || compareLexical(a.id, b.id))
    .slice(0, 2);
  for (const chair of selectedArmchairs) {
    if (chair.placementType !== 'floor') {
      throw new PlanningError('UNSUPPORTED_PLACEMENT', `Unsupported placement type for movable entity ${chair.id}: ${chair.placementType}`);
    }
    if (chair.source.kind !== 'roomObject') {
      throw new PlanningError('INVALID_ACTIVE_GROUP', `Movable entity ${chair.id} must originate from a room object`);
    }
  }
  return { sofa, armchairs: selectedArmchairs };
};
