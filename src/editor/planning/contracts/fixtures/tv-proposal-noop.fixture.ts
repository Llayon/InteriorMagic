import type { PlanProposal } from '../types';

export const tvProposalNoopFixture = {
  moves: [],
  scoreBefore: { total: 86 },
  scoreAfter: { total: 86 },
  findings: [
    {
      ruleId: 'tv-layout-summary',
      code: 'layout-already-good',
      severity: 'positive',
      objectIds: ['sofa-main', 'tv-1'],
    },
  ],
} satisfies PlanProposal;
