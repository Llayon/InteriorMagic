import { describe, expect, it } from 'vitest';
import type { PlanProposal } from '@/editor/planning/contracts';
import { planningProjectFingerprint } from './projectFingerprint';
import { createRealPlannerOrchestrator } from './realOrchestrator';
import { createIntegrationProject, resolveIntegrationAsset } from './testFixtures';
import { PlanningError, type PlanningErrorCode } from '@/editor/planning/livingRoom';

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

describe('real planner orchestrator', () => {
  it('reads the current project and rebuilds the real scene on every analysis', async () => {
    let project = createIntegrationProject({ tv: false });
    const ui = uiPort();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
    });
    await orchestrator.beginAnalysis();
    expect(ui.state.status).toBe('error');
    expect(ui.state.error).toMatch(/телевизор/);
    project = createIntegrationProject();
    await orchestrator.beginAnalysis();
    expect(ui.state.status).toBe('ready');
    expect(ui.state.proposal?.moves.length).toBeGreaterThan(0);
  });

  it('captures the analyzed fingerprint and proposal without mutating the source', async () => {
    const project = createIntegrationProject();
    const snapshot = structuredClone(project);
    const ui = uiPort();
    let applied: { moves: PlanProposal['moves']; fingerprint: string } | null = null;
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: (moves, fingerprint) => { applied = { moves, fingerprint }; return { ok: true }; },
    });
    await orchestrator.beginAnalysis();
    expect(project).toEqual(snapshot);
    expect(orchestrator.applyCurrentProposal?.()).toEqual({ ok: true });
    expect(applied).not.toBeNull();
    expect(applied!.fingerprint).toBe(planningProjectFingerprint(project));
    expect(applied!.moves).toEqual(ui.state.proposal!.moves);
  });

  it('drops stale completion after cancelPending', async () => {
    const project = createIntegrationProject();
    const ui = uiPort();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => project, store: ui.port, resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }), beforeAnalysis: () => wait,
    });
    const pending = orchestrator.beginAnalysis();
    orchestrator.cancelPending();
    release();
    await pending;
    expect(ui.state.status).toBe('loading');
    expect(ui.state.proposal).toBeNull();
  });

  it('turns a missing live proposal target into a controlled error', async () => {
    const analyzed = createIntegrationProject();
    const changed = structuredClone(analyzed);
    changed.objects = changed.objects.filter((object) => object.instanceId !== 'sofa');
    let reads = 0;
    const ui = uiPort();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => ++reads === 1 ? analyzed : changed,
      store: ui.port, resolveAsset: resolveIntegrationAsset, applyMoves: () => ({ ok: true }),
    });
    await orchestrator.beginAnalysis();
    expect(ui.state.status).toBe('error');
    expect(ui.state.proposal).toBeNull();
  });

  it.each([
    ['INVALID_SCENE', 'Текущая комната пока не поддерживается планировщиком.'],
    ['INVALID_ACTIVE_GROUP', 'Текущая комната пока не поддерживается планировщиком.'],
    ['CURRENT_LAYOUT_INVALID', 'Текущая расстановка нарушает обязательные ограничения планировщика.'],
    ['NO_VALID_PLAN', 'Не удалось найти допустимую расстановку.'],
    ['SEARCH_LIMIT_EXCEEDED', 'Не удалось безопасно завершить планирование расстановки.'],
  ] as const)('maps PlanningError %s to a controlled message', async (code: PlanningErrorCode, expected: string) => {
    const ui = uiPort();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: createIntegrationProject,
      store: ui.port,
      resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
      plan: () => { throw new PlanningError(code, 'internal planning detail'); },
    });

    await orchestrator.beginAnalysis();

    expect(ui.state.status).toBe('error');
    expect(ui.state.error).toBe(expected);
    expect(ui.state.error).not.toContain('internal planning detail');
  });

  it('keeps unknown non-PlanningError failures on the generic controlled message', async () => {
    const ui = uiPort();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: createIntegrationProject,
      store: ui.port,
      resolveAsset: resolveIntegrationAsset,
      applyMoves: () => ({ ok: true }),
      plan: () => { throw new Error('internal planning detail'); },
    });

    await orchestrator.beginAnalysis();

    expect(ui.state.error).toBe('Не удалось проанализировать расстановку.');
    expect(ui.state.error).not.toContain('internal planning detail');
  });
});
