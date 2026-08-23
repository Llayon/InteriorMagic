import type { PlanningGoal } from '../types';

// tv-1 is an opaque ID supplied by the planning context. Priority order expresses
// relative intent only; deterministic rule packs retain ownership of numeric weights.
export const tvGoalFixture = {
  activity: 'watchTv',
  focalPointId: 'tv-1',
  priorities: ['circulation', 'viewing', 'conversation'],
} satisfies PlanningGoal;
