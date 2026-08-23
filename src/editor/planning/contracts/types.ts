export type PlanningEntityId = string;

export type PlanningPriority = 'viewing' | 'circulation' | 'conversation';

export type PlanningGoal = {
  activity: 'watchTv';
  focalPointId: PlanningEntityId;
  priorities?: PlanningPriority[];
};

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
