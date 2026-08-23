import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/editor/model/types';
import type { PlanProposal } from '../contracts';
import { createFixtureOrchestrator } from './fixtures';
import { usePlannerStore } from './store';
import { createLiveProjectTargetResolver } from './targetResolver';

describe('planner bootstrap target resolver', () => {
  beforeEach(() => usePlannerStore.getState().reset());

  it('routes an injected unknown ProposedMove target to the controlled orchestrator error', async () => {
    const project = createDefaultProject();
    project.objects = [{ instanceId: 'known-sofa', assetId: 'sofa', position: { x: 0, y: 0, z: 0 }, rotationY: 0 }];
    const injected: PlanProposal = {
      moves: [{ instanceId: 'unknown-chair', position: { x: 1, z: 1 }, rotationY: 0 }],
      scoreBefore: { total: 20 }, scoreAfter: { total: 80 }, findings: [],
    };
    const resolver = createLiveProjectTargetResolver(() => project);
    const store = {
      beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
      receiveProposal: (proposal: PlanProposal) => usePlannerStore.getState().receiveProposal(proposal),
      failAnalysis: (error: string) => usePlannerStore.getState().failAnalysis(error),
    };
    const orchestrator = createFixtureOrchestrator('improved', store, resolver, async () => injected);

    await orchestrator.beginAnalysis();

    expect(usePlannerStore.getState().status).toBe('error');
    expect(usePlannerStore.getState().error).toMatch(/unknown-chair/);
    expect(usePlannerStore.getState().proposal).toBeNull();
    expect(resolver(['known-sofa', 'unknown-chair'])).toEqual(new Set(['known-sofa']));
  });
});
