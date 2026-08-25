export type PlanningEntityId = string;

export type PlanningPriorityV1 = 'viewing' | 'circulation' | 'conversation';

export type PlanningGoalV1 = {
  activity: 'watchTv';
  focalPointId: PlanningEntityId;
  priorities?: PlanningPriorityV1[];
};

export type WatchTvGoalV2 = {
  activity: 'watchTv';
  focalPointId: PlanningEntityId;
};

export type ConversationGoalV2 = {
  activity: 'conversation';
};

export type PlanningGoalV2 = WatchTvGoalV2 | ConversationGoalV2;

/** @deprecated Explicitly select PlanningGoalV1 or PlanningGoalV2. */
export type PlanningGoal = PlanningGoalV1;
/** @deprecated V1-only compatibility alias. */
export type PlanningPriority = PlanningPriorityV1;

export type ProposedMove = {
  instanceId: string;
  position: {
    x: number;
    z: number;
  };
  rotationY: number;
};

export type FindingParam = string | number | boolean;

export type PlanningFinding = {
  ruleId: string;
  code: string;
  severity: 'positive' | 'info' | 'warning';
  objectIds?: string[];
  params?: Record<string, FindingParam>;
  scoreImpact?: number;
};

export type PlanningScore = {
  total: number;
};

export type PlanProposal = {
  moves: ProposedMove[];
  scoreBefore: PlanningScore;
  scoreAfter: PlanningScore;
  findings: PlanningFinding[];
};
