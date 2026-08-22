import type { PlanProposal } from '../types';

export const tvProposalImprovedFixture = {
  moves: [
    {
      instanceId: 'sofa-main',
      position: { x: 1.25, z: 3.4 },
      rotationY: 3.141592653589793,
    },
    {
      instanceId: 'armchair-left',
      position: { x: 0.65, z: 2.25 },
      rotationY: 2.356194490192345,
    },
  ],
  scoreBefore: { total: 42 },
  scoreAfter: { total: 78 },
  findings: [
    {
      ruleId: 'tv-viewing-orientation',
      code: 'good-tv-orientation',
      severity: 'positive',
      objectIds: ['sofa-main', 'tv-1'],
      params: { angleDegrees: 4 },
      scoreImpact: 24,
    },
    {
      ruleId: 'front-clearance',
      code: 'insufficient-front-clearance',
      severity: 'warning',
      objectIds: ['armchair-left'],
      params: { availableMeters: 0.68, recommendedMeters: 0.75 },
      scoreImpact: -4,
    },
  ],
} satisfies PlanProposal;
