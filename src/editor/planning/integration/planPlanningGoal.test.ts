import { describe, expect, it } from 'vitest';
import { planConversation } from '@/editor/planning/conversation';
import { planTvViewing } from '@/editor/planning/tv';
import { planTvViewingWithLegacyPriorities } from '@/editor/planning/tv/planner';
import { planLegacyPlanningGoalV1, planPlanningGoal } from './planPlanningGoal';
import { projectPlanningScene } from './projectPlanningScene';
import { createIntegrationProject, resolveIntegrationAsset } from './testFixtures';

describe('exhaustive PlanningGoalV2 router', () => {
  it('routes watchTv to the unchanged default TV scenario without mutating the scene', () => {
    const scene = projectPlanningScene(createIntegrationProject(), resolveIntegrationAsset);
    const snapshot = structuredClone(scene);
    const goal = { activity: 'watchTv', focalPointId: 'room-object:tv' } as const;
    expect(planPlanningGoal(scene, goal)).toEqual(planTvViewing(scene, goal));
    expect(scene).toEqual(snapshot);
  });

  it('routes focal-free Conversation to the unchanged Conversation scenario', () => {
    const scene = projectPlanningScene(createIntegrationProject({ tv: false }), resolveIntegrationAsset);
    expect(planPlanningGoal(scene, { activity: 'conversation' })).toEqual(planConversation(scene));
  });

  it('preserves v1 priority semantics only through the explicit legacy adapter', () => {
    const scene = projectPlanningScene(createIntegrationProject(), resolveIntegrationAsset);
    const priorities = ['circulation', 'viewing'] as const;
    expect(planLegacyPlanningGoalV1(scene, {
      activity: 'watchTv', focalPointId: 'room-object:tv', priorities: [...priorities],
    })).toEqual(planTvViewingWithLegacyPriorities(scene, {
      activity: 'watchTv', focalPointId: 'room-object:tv',
    }, priorities));
  });
});
