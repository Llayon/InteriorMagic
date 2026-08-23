import type { PlanProposal } from '../contracts';
import type { PlannerFixtureId } from './types';

/**
 * Dev/test fixture harness for the planner UX.
 *
 * Encapsulates everything fixture-specific — fixture IDs, the deterministic
 * artificial delay, the canonical Contract v1 loader, the ProposedMove
 * target-existence check, and the orchestrator-level supersession token.
 *
 * Lives separately from the editor store and RoomProject. Never writes to
 * RoomProject, the undo stack, or any persistent state.
 *
 * Each orchestrator owns its own generation counter. `cancelPending()` is
 * synchronous, idempotent, and safe when nothing is in flight. A stale async
 * completion (delay returns, loader resolves) is dropped if its generation
 * no longer matches the orchestrator's current token.
 */

const TEST_DELAY_MS = 320;

const delay = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * Returns a deep clone so the UI may safely mutate the proposal without
 * disturbing the canonical export used by tests. Arrays and nested objects
 * are read-only at runtime (preview rendering never mutates them), so a
 * shallow clone is sufficient.
 */
const cloneProposal = (proposal: PlanProposal): PlanProposal => ({
  moves: proposal.moves.map((move) => ({ ...move, position: { ...move.position } })),
  scoreBefore: { ...proposal.scoreBefore },
  scoreAfter: { ...proposal.scoreAfter },
  findings: proposal.findings.map((finding) => {
    const copy: PlanProposal['findings'][number] = { ...finding };
    if (finding.objectIds) copy.objectIds = [...finding.objectIds];
    if (finding.params) {
      const cleaned: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(finding.params)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          cleaned[key] = value;
        }
      }
      copy.params = cleaned;
    }
    return copy;
  }),
});

export const loadCanonicalProposalFixture = async (
  id: Exclude<PlannerFixtureId, 'error'>,
): Promise<PlanProposal> => {
  switch (id) {
    case 'improved': {
      const { tvProposalImprovedFixture } = await import('../contracts/fixtures/tv-proposal-improved.fixture');
      return cloneProposal(tvProposalImprovedFixture as unknown as PlanProposal);
    }
    case 'noop': {
      const { tvProposalNoopFixture } = await import('../contracts/fixtures/tv-proposal-noop.fixture');
      return cloneProposal(tvProposalNoopFixture as unknown as PlanProposal);
    }
    default: {
      const exhaustive: never = id;
      throw new Error(`Unknown planner fixture: ${String(exhaustive)}`);
    }
  }
};

/**
 * Orchestrator surface consumed by the UI. A real planner implements the
 * same surface — `beginAnalysis()` runs the work, `cancelPending()`
 * invalidates any in-flight operation synchronously. The orchestrator owns
 * its own generation token; the UI does NOT need to track one.
 */
export interface PlannerOrchestrator {
  beginAnalysis(): Promise<void>;
  cancelPending(): void;
}

/**
 * Function the orchestrator calls to validate that every ProposedMove
 * target exists in the live editor scene. The integration / bootstrap
 * layer (Track A real planner, fixture harness) supplies this; the
 * presentation layer never does.
 */
export type ResolvePlannerTargets = (ids: readonly string[]) => Set<string>;
export type LoadPlannerProposal = (id: Exclude<PlannerFixtureId, 'error'>) => Promise<PlanProposal>;

interface PlannerStoreShim {
  beginAnalysis(): void;
  receiveProposal(proposal: PlanProposal): void;
  failAnalysis(error: string): void;
}

/**
 * Test-only helper retained for backwards compatibility with existing tests.
 * Each orchestrator now owns its own generation token; tests should
 * construct fresh orchestrators per case rather than rely on a global reset.
 */
export const __resetOrchestratorForTests = (): void => {
  /* orchestrator-owned */
};

export const createFixtureOrchestrator = (
  fixtureId: Exclude<PlannerFixtureId, 'error'>,
  store: PlannerStoreShim,
  resolveTargets: ResolvePlannerTargets,
  loadProposal: LoadPlannerProposal = loadCanonicalProposalFixture,
): PlannerOrchestrator => {
  let generation = 0;
  return {
    async beginAnalysis() {
      const myGeneration = ++generation;
      store.beginAnalysis();
      await delay(TEST_DELAY_MS);
      if (myGeneration !== generation) return;
      let proposal: PlanProposal;
      try {
        proposal = await loadProposal(fixtureId);
      } catch (cause) {
        if (myGeneration !== generation) return;
        store.failAnalysis(cause instanceof Error ? cause.message : 'Unknown error');
        return;
      }
      if (myGeneration !== generation) return;
      if (proposal.moves.length > 0) {
        const known = resolveTargets(proposal.moves.map((move) => move.instanceId));
        const missing = proposal.moves.filter((move) => !known.has(move.instanceId));
        if (missing.length > 0) {
          if (myGeneration !== generation) return;
          store.failAnalysis(`Предложение ссылается на неизвестные объекты: ${missing.map((m) => m.instanceId).join(', ')}`);
          return;
        }
      }
      if (myGeneration !== generation) return;
      store.receiveProposal(proposal);
    },
    cancelPending() {
      generation += 1;
    },
  };
};

export const createErrorOrchestrator = (store: PlannerStoreShim): PlannerOrchestrator => {
  let generation = 0;
  return {
    async beginAnalysis() {
      const myGeneration = ++generation;
      store.beginAnalysis();
      await delay(TEST_DELAY_MS);
      if (myGeneration !== generation) return;
      store.failAnalysis('Не удалось получить предложение');
    },
    cancelPending() {
      generation += 1;
    },
  };
};
