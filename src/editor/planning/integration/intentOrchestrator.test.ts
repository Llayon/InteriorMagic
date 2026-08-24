import { describe, expect, it, vi } from 'vitest';
import type { PlanProposal, PlanningGoal } from '@/editor/planning/contracts';
import { createRealPlannerOrchestrator } from './realOrchestrator';
import { createIntegrationProject, resolveIntegrationAsset } from './testFixtures';

const uiPort = () => {
  const state: { status: 'idle' | 'loading' | 'ready' | 'error'; proposal: PlanProposal | null; error: string | null } = {
    status: 'idle', proposal: null, error: null,
  };
  return {
    state,
    port: {
      beginAnalysis: () => { state.status = 'loading'; state.proposal = null; state.error = null; },
      receiveProposal: (proposal: PlanProposal) => { state.status = 'ready'; state.proposal = proposal; },
      failAnalysis: (error: string) => { state.status = 'error'; state.error = error; state.proposal = null; },
    },
  };
};

const outputProvider = (output: unknown, wait?: Promise<void>) => () => ({
  async interpret() { if (wait) await wait; return output; },
});

describe('real planner intent analysis port', () => {
  it('feeds a validated goal into the existing deterministic planner path', async () => {
    const project = createIntegrationProject();
    const snapshot = structuredClone(project);
    const ui = uiPort();
    let receivedGoal: PlanningGoal | null = null;
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
      createIntentProvider: outputProvider({
        activity: 'watchTv', focalPointId: 'room-object:tv', priorities: ['circulation', 'viewing'],
      }),
      plan: (scene, goal) => { receivedGoal = goal; return { moves: [], findings: [], scoreBefore: { total: 1 }, scoreAfter: { total: 1 } }; },
    });
    await orchestrator.beginAnalysisFromText('Главное — проход');
    expect(receivedGoal).toEqual({
      activity: 'watchTv', focalPointId: 'room-object:tv', priorities: ['circulation', 'viewing'],
    });
    expect(ui.state.status).toBe('ready');
    expect(project).toEqual(snapshot);
  });

  it.each([
    ['unsupported', { intent: 'unsupported_intent' }],
    ['ambiguous', { intent: 'ambiguous_focal' }],
    ['invalid', { activity: 'dance', focalPointId: 'room-object:tv' }],
    ['invented focal', { activity: 'watchTv', focalPointId: 'invented' }],
  ])('turns %s model output into a controlled error without planning', async (_name, output) => {
    const project = createIntegrationProject();
    const ui = uiPort();
    const plan = vi.fn();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }), createIntentProvider: outputProvider(output), plan,
    });
    await orchestrator.beginAnalysisFromText('request');
    expect(ui.state.status).toBe('error');
    expect(ui.state.proposal).toBeNull();
    expect(plan).not.toHaveBeenCalled();
  });

  it('maps provider failures to a controlled error', async () => {
    const project = createIntegrationProject();
    const ui = uiPort();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }), createIntentProvider: () => ({ interpret: async () => { throw new Error('offline'); } }),
    });
    await orchestrator.beginAnalysisFromText('request');
    expect(ui.state).toMatchObject({ status: 'error', proposal: null });
    expect(ui.state.error).toMatch(/недоступен/);
  });

  it('discards an AI result when the room changes while it is pending', async () => {
    let project = createIntegrationProject();
    const original = project;
    const ui = uiPort();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const plan = vi.fn();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
      createIntentProvider: outputProvider({ activity: 'watchTv', focalPointId: 'room-object:tv' }, wait), plan,
    });
    const pending = orchestrator.beginAnalysisFromText('request');
    await vi.waitFor(() => expect(ui.state.status).toBe('loading'));
    project = structuredClone(project);
    project.objects[1]!.position.x += 0.1;
    release();
    await pending;
    expect(plan).not.toHaveBeenCalled();
    expect(ui.state.status).toBe('error');
    expect(original.objects[1]!.position.x).not.toBe(project.objects[1]!.position.x);
  });

  it('allows only the newest request to publish', async () => {
    const project = createIntegrationProject();
    const ui = uiPort();
    let releaseFirst!: () => void;
    const firstWait = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let markFirstEntered!: () => void;
    const firstEntered = new Promise<void>((resolve) => { markFirstEntered = resolve; });
    let calls = 0;
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
      createIntentProvider: () => ({
        async interpret() {
          calls += 1;
          if (calls === 1) { markFirstEntered(); await firstWait; }
          return { activity: 'watchTv', focalPointId: 'room-object:tv' };
        },
      }),
    });
    const first = orchestrator.beginAnalysisFromText('first');
    await firstEntered;
    const second = orchestrator.beginAnalysisFromText('second');
    await second;
    const proposal = ui.state.proposal;
    releaseFirst();
    await first;
    expect(ui.state.status).toBe('ready');
    expect(ui.state.proposal).toEqual(proposal);
  });

  it('aborts and drops completion after cancelPending', async () => {
    const project = createIntegrationProject();
    const ui = uiPort();
    let signal: AbortSignal | null = null;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
      createIntentProvider: (ownSignal) => {
        signal = ownSignal;
        return { async interpret() { await wait; return { activity: 'watchTv', focalPointId: 'room-object:tv' }; } };
      },
    });
    const pending = orchestrator.beginAnalysisFromText('request');
    await vi.waitFor(() => expect(signal).not.toBeNull());
    orchestrator.cancelPending();
    expect(signal!.aborted).toBe(true);
    release();
    await pending;
    expect(ui.state).toMatchObject({ status: 'loading', proposal: null });
  });
});
