import type {
  PlanningGoalV1,
  PlanningGoalV2,
  PlanningPriorityV1,
  PlanProposal,
  WatchTvGoalV2,
} from '@/editor/planning/contracts';
import { planConversation } from '@/editor/planning/conversation';
import type { PlanningScene } from '@/editor/planning/livingRoom';
import { planTvViewing } from '@/editor/planning/tv';
import { planTvViewingWithLegacyPriorities } from '@/editor/planning/tv/planner';

/** Internal migration request. Not a public, AI, persistence, or proposal contract. */
type NormalizedPlanningRequest =
  | { activity: 'watchTv'; goal: WatchTvGoalV2; legacyTvPriorities?: readonly PlanningPriorityV1[] }
  | { activity: 'conversation'; goal: Extract<PlanningGoalV2, { activity: 'conversation' }> };

const normalizePlanningGoalV1 = (goal: PlanningGoalV1): NormalizedPlanningRequest => ({
  activity: 'watchTv',
  goal: { activity: 'watchTv', focalPointId: goal.focalPointId },
  ...(goal.priorities === undefined ? {} : { legacyTvPriorities: [...goal.priorities] }),
});

const routeNormalizedPlanningRequest = (
  scene: PlanningScene,
  request: NormalizedPlanningRequest,
): PlanProposal => {
  switch (request.activity) {
    case 'watchTv':
      return request.legacyTvPriorities === undefined
        ? planTvViewing(scene, request.goal)
        : planTvViewingWithLegacyPriorities(scene, request.goal, request.legacyTvPriorities);
    case 'conversation':
      return planConversation(scene);
    default: {
      const unreachable: never = request;
      return unreachable;
    }
  }
};

export const planPlanningGoal = (scene: PlanningScene, goal: PlanningGoalV2): PlanProposal => {
  switch (goal.activity) {
    case 'watchTv':
      return routeNormalizedPlanningRequest(scene, { activity: 'watchTv', goal });
    case 'conversation':
      return routeNormalizedPlanningRequest(scene, { activity: 'conversation', goal });
    default: {
      const unreachable: never = goal;
      return unreachable;
    }
  }
};

export const planLegacyPlanningGoalV1 = (
  scene: PlanningScene,
  goal: PlanningGoalV1,
): PlanProposal => routeNormalizedPlanningRequest(scene, normalizePlanningGoalV1(goal));
