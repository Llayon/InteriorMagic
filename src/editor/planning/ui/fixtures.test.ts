import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCanonicalProposalFixture, createFixtureOrchestrator, createErrorOrchestrator, type ResolvePlannerTargets } from './fixtures';
import { usePlannerStore } from './store';
import { tvProposalImprovedFixture } from '../contracts/fixtures/tv-proposal-improved.fixture';
import { tvProposalNoopFixture } from '../contracts/fixtures/tv-proposal-noop.fixture';
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

describe('canonical proposal fixture loader', () => {
  it('returns a deep clone of the improved fixture without mutating the canonical export', async () => {
    const loaded = await loadCanonicalProposalFixture('improved');
    expect(loaded.moves).toHaveLength(2);
    expect(loaded.scoreAfter.total).toBe(tvProposalImprovedFixture.scoreAfter.total);
    // Mutate the clone; the canonical export must be untouched.
    loaded.moves[0]!.position.x = 999;
    expect(tvProposalImprovedFixture.moves[0]!.position.x).not.toBe(999);
    expect(loaded.moves[0]!.position.x).toBe(999);
  });

  it('returns the noop fixture as a clone with empty moves', async () => {
    const loaded = await loadCanonicalProposalFixture('noop');
    expect(loaded.moves).toEqual([]);
    expect(loaded.scoreBefore).toEqual(tvProposalNoopFixture.scoreBefore);
    expect(loaded.scoreAfter).toEqual(tvProposalNoopFixture.scoreAfter);
    // Mutate the clone; canonical export must remain pristine.
    loaded.findings.push({ ruleId: 'fake', code: 'fake', severity: 'info' });
    expect(tvProposalNoopFixture.findings).toHaveLength(1);
  });

  it('returns the exact improved fixture content via canonical contract types', async () => {
    const loaded = await loadCanonicalProposalFixture('improved');
    expect(loaded.moves[0]!.instanceId).toBe(tvProposalImprovedFixture.moves[0]!.instanceId);
    expect(loaded.findings.map((f) => f.code).sort()).toEqual(['good-tv-orientation', 'insufficient-front-clearance']);
  });
});

describe('PlannerOrchestrator cancelPending', () => {
  beforeEach(() => {
    usePlannerStore.setState({ status: 'idle', proposal: null, error: null, isPreviewing: false });
  });

  afterEach(() => {
    usePlannerStore.setState({ status: 'idle', proposal: null, error: null, isPreviewing: false });
  });

  it('cancelPending() called before the delay elapses prevents receiveProposal', async () => {
    const shim = {
      beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
      receiveProposal: () => {
        // Must not be called.
        throw new Error('receiveProposal should not run after cancel');
      },
      failAnalysis: () => {
        throw new Error('failAnalysis should not run after cancel');
      },
    };
    const orch = createFixtureOrchestrator('noop', shim, (ids) => new Set(ids));
    const p = orch.beginAnalysis();
    orch.cancelPending();
    await p;
    // Status stays at loading; nothing was written.
    expect(usePlannerStore.getState().status).toBe('loading');
    expect(usePlannerStore.getState().proposal).toBeNull();
    expect(usePlannerStore.getState().error).toBeNull();
  });

  it('cancelPending() is idempotent and safe when nothing is running', () => {
    const shim = {
      beginAnalysis: () => undefined,
      receiveProposal: () => undefined,
      failAnalysis: () => undefined,
    };
    const orch = createFixtureOrchestrator('noop', shim, () => new Set());
    expect(() => orch.cancelPending()).not.toThrow();
    expect(() => orch.cancelPending()).not.toThrow();
  });

  it('beginAnalysis after cancelPending supersedes cleanly and reaches ready', async () => {
    const shim = {
      beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
      receiveProposal: (p: PlanProposal) => usePlannerStore.getState().receiveProposal(p),
      failAnalysis: (e: string) => usePlannerStore.getState().failAnalysis(e),
    };
    const resolveTargets: ResolvePlannerTargets = (ids) => new Set(ids);
    const orch = createFixtureOrchestrator('improved', shim, resolveTargets);
    const first = orch.beginAnalysis();
    orch.cancelPending();
    await first;
    expect(usePlannerStore.getState().status).toBe('loading');
    // Second call supersedes cleanly.
    await orch.beginAnalysis();
    expect(usePlannerStore.getState().status).toBe('ready');
    expect(usePlannerStore.getState().proposal?.moves).toHaveLength(2);
  });

  it('cancelPending on error orchestrator prevents failAnalysis', async () => {
    const shim = {
      beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
      receiveProposal: (p: PlanProposal) => usePlannerStore.getState().receiveProposal(p),
      failAnalysis: (e: string) => usePlannerStore.getState().failAnalysis(e),
    };
    const orch = createErrorOrchestrator(shim);
    const p = orch.beginAnalysis();
    orch.cancelPending();
    await p;
    expect(usePlannerStore.getState().status).toBe('loading');
    expect(usePlannerStore.getState().error).toBeNull();
  });

  it('resolveTargets is NOT called when the orchestrator is cancelled before delay elapses', async () => {
    let resolveCalls = 0;
    const shim = {
      beginAnalysis: () => undefined,
      receiveProposal: () => undefined,
      failAnalysis: () => undefined,
    };
    const orch = createFixtureOrchestrator('improved', shim, () => {
      resolveCalls += 1;
      return new Set();
    });
    const p = orch.beginAnalysis();
    orch.cancelPending();
    await p;
    expect(resolveCalls).toBe(0);
  });

  it('cancelPending after a complete analysis is a safe no-op', async () => {
    const shim = {
      beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
      receiveProposal: (p: PlanProposal) => usePlannerStore.getState().receiveProposal(p),
      failAnalysis: (e: string) => usePlannerStore.getState().failAnalysis(e),
    };
    const orch = createFixtureOrchestrator('noop', shim, () => new Set());
    await orch.beginAnalysis();
    expect(usePlannerStore.getState().status).toBe('ready');
    // Cancel after completion must not disturb the resolved state.
    orch.cancelPending();
    expect(usePlannerStore.getState().status).toBe('ready');
    expect(usePlannerStore.getState().proposal).not.toBeNull();
  });

  it('selectPreviewOverride continues to derive the override after a cancelled then re-issued analysis', async () => {
    // Sanity: cancellation does not corrupt the preview override derivation.
    const { selectPreviewOverride } = await import('./store');
    usePlannerStore.setState({
      status: 'idle',
      proposal: IMPROVED,
      error: null,
      isPreviewing: false,
    });
    // Pretend a completed analysis left an improved proposal in store.
    usePlannerStore.getState().reset();
    usePlannerStore.getState().receiveProposal(IMPROVED);
    usePlannerStore.getState().enterPreview();
    expect(usePlannerStore.getState().isPreviewing).toBe(true);
    const sofa: ProposedMove | null = selectPreviewOverride(usePlannerStore.getState(), 'sofa-main');
    expect(sofa).not.toBeNull();
    expect(sofa!.position.x).toBeCloseTo(1.25, 2);
  });
});
