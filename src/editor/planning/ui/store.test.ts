import { beforeEach, describe, expect, it } from 'vitest';
import { selectPreviewOverride, usePlannerStore } from './store';
import { createFixtureOrchestrator } from './fixtures';
import type { PlanProposal, ProposedMove } from '../contracts';

const IMPROVED: PlanProposal = {
  moves: [
    { instanceId: 'sofa-main', position: { x: 1.25, z: 3.4 }, rotationY: 3.141592653589793 },
    { instanceId: 'armchair-left', position: { x: 0.65, z: 2.25 }, rotationY: 2.356194490192345 },
  ],
  scoreBefore: { total: 42 },
  scoreAfter: { total: 78 },
  findings: [
    { ruleId: 'r', code: 'good-tv-orientation', severity: 'positive', objectIds: ['sofa-main'], params: { angleDegrees: 4 } },
  ],
};

const NOOP: PlanProposal = {
  moves: [],
  scoreBefore: { total: 86 },
  scoreAfter: { total: 86 },
  findings: [{ ruleId: 'r', code: 'layout-already-good', severity: 'positive' }],
};

const NO_VALID_PLAN: PlanProposal = {
  moves: [],
  scoreBefore: { total: 50 },
  scoreAfter: { total: 50 },
  findings: [{ ruleId: 'r', code: 'layout-no-valid-plan', severity: 'info' }],
};

describe('PlannerUiStore state machine (orchestrator-agnostic)', () => {
  beforeEach(() => {
    usePlannerStore.setState({ status: 'idle', proposal: null, error: null, isPreviewing: false });
  });

  it('starts in idle with no proposal, error, or preview', () => {
    expect(usePlannerStore.getState().status).toBe('idle');
    expect(usePlannerStore.getState().proposal).toBeNull();
    expect(usePlannerStore.getState().error).toBeNull();
    expect(usePlannerStore.getState().isPreviewing).toBe(false);
  });

  it('transitions idle → loading via beginAnalysis, cleans prior state', () => {
    usePlannerStore.getState().receiveProposal(NOOP);
    usePlannerStore.setState({ error: 'stale' });
    usePlannerStore.getState().beginAnalysis();
    const state = usePlannerStore.getState();
    expect(state.status).toBe('loading');
    expect(state.proposal).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isPreviewing).toBe(false);
  });

  it('transitions loading → ready via receiveProposal', () => {
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().receiveProposal(IMPROVED);
    const state = usePlannerStore.getState();
    expect(state.status).toBe('ready');
    expect(state.proposal).toEqual(IMPROVED);
    expect(state.error).toBeNull();
    expect(state.isPreviewing).toBe(false);
  });

  it('transitions loading → error via failAnalysis and clears any prior proposal', () => {
    usePlannerStore.setState({ status: 'ready', proposal: IMPROVED, error: null, isPreviewing: false });
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().failAnalysis('boom');
    const state = usePlannerStore.getState();
    expect(state.status).toBe('error');
    expect(state.proposal).toBeNull();
    expect(state.error).toBe('boom');
  });

  it('receiveProposal supersedes a pending analysis (proposal swaps)', () => {
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().receiveProposal(IMPROVED);
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().receiveProposal(NOOP);
    expect(usePlannerStore.getState().proposal?.moves).toEqual([]);
  });

  it('failAnalysis supersedes a pending analysis (no proposal leak)', () => {
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().receiveProposal(IMPROVED);
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().failAnalysis('late');
    expect(usePlannerStore.getState().status).toBe('error');
    expect(usePlannerStore.getState().proposal).toBeNull();
  });

  it('enterPreview requires status === ready and only flips isPreviewing', () => {
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().enterPreview();
    expect(usePlannerStore.getState().isPreviewing).toBe(false);
    usePlannerStore.getState().receiveProposal(IMPROVED);
    usePlannerStore.getState().enterPreview();
    expect(usePlannerStore.getState().isPreviewing).toBe(true);
  });

  it('exitPreview clears the flag without touching status or proposal', () => {
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().receiveProposal(IMPROVED);
    usePlannerStore.getState().enterPreview();
    usePlannerStore.getState().exitPreview();
    const state = usePlannerStore.getState();
    expect(state.isPreviewing).toBe(false);
    expect(state.status).toBe('ready');
    expect(state.proposal).not.toBeNull();
  });

  it('reset returns every field to its idle default', () => {
    usePlannerStore.getState().beginAnalysis();
    usePlannerStore.getState().receiveProposal(IMPROVED);
    usePlannerStore.getState().enterPreview();
    usePlannerStore.getState().reset();
    const { status, proposal, error, isPreviewing } = usePlannerStore.getState();
    expect({ status, proposal, error, isPreviewing }).toEqual({
      status: 'idle',
      proposal: null,
      error: null,
      isPreviewing: false,
    });
  });
});

describe('Fixture orchestrator drives the UI store', () => {
  beforeEach(() => {
    usePlannerStore.setState({ status: 'idle', proposal: null, error: null, isPreviewing: false });
  });

  const shim = {
    beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
    receiveProposal: (p: PlanProposal) => usePlannerStore.getState().receiveProposal(p),
    failAnalysis: (e: string) => usePlannerStore.getState().failAnalysis(e),
  };

  it('loads an improved proposal into the UI store', async () => {
    const orch = createFixtureOrchestrator('improved', shim, (ids) => new Set(ids));
    await orch.beginAnalysis();
    const state = usePlannerStore.getState();
    expect(state.status).toBe('ready');
    expect(state.proposal?.moves).toHaveLength(2);
    expect(state.proposal?.findings[0]?.code).toBe('good-tv-orientation');
  });

  it('loads a noop proposal with empty moves', async () => {
    const orch = createFixtureOrchestrator('noop', shim, (ids) => new Set(ids));
    await orch.beginAnalysis();
    const state = usePlannerStore.getState();
    expect(state.status).toBe('ready');
    expect(state.proposal?.moves).toEqual([]);
  });

  it('surfaces unresolved ProposedMove.instanceId as a controlled error', async () => {
    const orch = createFixtureOrchestrator('improved', shim, () => new Set(['sofa-main']));
    await orch.beginAnalysis();
    const state = usePlannerStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatch(/armchair-left/);
    expect(state.proposal).toBeNull();
  });

  it('supersedes a stale beginAnalysis call (second wins, first is dropped)', async () => {
    const orch = createFixtureOrchestrator('improved', shim, (ids) => new Set(ids));
    const first = orch.beginAnalysis();
    const second = orch.beginAnalysis();
    await Promise.all([first, second]);
    expect(usePlannerStore.getState().status).toBe('ready');
  });

  it('does not run target validation when there are no moves (empty resolver is OK)', async () => {
    const orch = createFixtureOrchestrator('noop', shim, () => new Set());
    await orch.beginAnalysis();
    expect(usePlannerStore.getState().status).toBe('ready');
  });

  it('NO_VALID_PLAN outcome is preserved by the store for the classifier', () => {
    usePlannerStore.getState().receiveProposal(NO_VALID_PLAN);
    expect(usePlannerStore.getState().proposal?.findings[0]?.code).toBe('layout-no-valid-plan');
  });
});

describe('selectPreviewOverride derivation', () => {
  beforeEach(() => {
    usePlannerStore.setState({ status: 'idle', proposal: null, error: null, isPreviewing: false });
  });

  it('returns null when preview is inactive', () => {
    usePlannerStore.setState({ status: 'ready', proposal: IMPROVED, isPreviewing: false });
    expect(selectPreviewOverride(usePlannerStore.getState(), 'sofa-main')).toBeNull();
  });

  it('returns null when status is not ready', () => {
    usePlannerStore.setState({ status: 'loading', proposal: null, isPreviewing: true });
    expect(selectPreviewOverride(usePlannerStore.getState(), 'sofa-main')).toBeNull();
  });

  it('returns the matching move when preview is active', () => {
    usePlannerStore.setState({ status: 'ready', proposal: IMPROVED, isPreviewing: true });
    const sofa: ProposedMove | null = selectPreviewOverride(usePlannerStore.getState(), 'sofa-main');
    expect(sofa).not.toBeNull();
    expect(sofa!.position).toEqual({ x: 1.25, z: 3.4 });
    expect(sofa!.rotationY).toBeCloseTo(Math.PI);
  });

  it('returns null for instances not targeted by any move', () => {
    usePlannerStore.setState({ status: 'ready', proposal: IMPROVED, isPreviewing: true });
    expect(selectPreviewOverride(usePlannerStore.getState(), 'tv-1')).toBeNull();
  });

  it('returns null when status is error', () => {
    usePlannerStore.setState({ status: 'error', error: 'bad', isPreviewing: true });
    expect(selectPreviewOverride(usePlannerStore.getState(), 'sofa-main')).toBeNull();
  });
});
