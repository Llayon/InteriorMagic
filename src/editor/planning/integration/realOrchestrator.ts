import type { RoomProject } from '@/editor/model/types';
import type { PlanProposal } from '@/editor/planning/contracts';
import type { PlannerApplyResult, PlannerOrchestrator } from '@/editor/planning/application/types';
import { planTvViewing } from '@/editor/planning/tv';
import { buildPlanningScene, PlanningSceneBuildError, resolveSingleTvFocalId, type AssetDefinitionResolver } from './buildPlanningScene';
import { planningProjectFingerprint } from './projectFingerprint';

export interface RealPlannerStorePort {
  beginAnalysis(): void;
  receiveProposal(proposal: PlanProposal): void;
  failAnalysis(error: string): void;
}

export interface RealPlannerDependencies {
  readProject(): RoomProject;
  store: RealPlannerStorePort;
  applyMoves(moves: PlanProposal['moves'], analyzedFingerprint: string): PlannerApplyResult;
  resolveAsset?: AssetDefinitionResolver;
  beforeAnalysis?: () => Promise<void>;
}

const controlledAnalysisMessage = (cause: unknown): string => {
  if (cause instanceof PlanningSceneBuildError) {
    if (cause.code === 'no-tv') return 'В комнате не найден поддерживаемый телевизор.';
    if (cause.code === 'ambiguous-tv') return 'Найдено несколько телевизоров. Выбор цели пока не поддерживается.';
    return 'Текущая комната пока не поддерживается планировщиком.';
  }
  if (cause instanceof Error && cause.message.includes('Current PlanningScene arrangement')) {
    return 'Текущая расстановка нарушает обязательные ограничения планировщика.';
  }
  return 'Не удалось проанализировать расстановку.';
};

export const createRealPlannerOrchestrator = ({
  readProject,
  store,
  applyMoves,
  resolveAsset,
  beforeAnalysis = () => Promise.resolve(),
}: RealPlannerDependencies): PlannerOrchestrator => {
  let generation = 0;
  let analyzed: { proposal: PlanProposal; fingerprint: string } | null = null;
  return {
    async beginAnalysis() {
      const ownGeneration = ++generation;
      analyzed = null;
      store.beginAnalysis();
      await beforeAnalysis();
      if (ownGeneration !== generation) return;
      try {
        const project = readProject();
        const fingerprint = planningProjectFingerprint(project);
        const scene = buildPlanningScene(project, resolveAsset);
        const focalPointId = resolveSingleTvFocalId(scene);
        const proposal = planTvViewing(scene, { activity: 'watchTv', focalPointId });
        if (ownGeneration !== generation) return;
        const currentIds = new Set(readProject().objects.map((object) => object.instanceId));
        const missing = proposal.moves.filter((move) => !currentIds.has(move.instanceId));
        if (missing.length > 0) throw new PlanningSceneBuildError('invalid-project', 'Proposal contains missing targets');
        analyzed = { proposal, fingerprint };
        store.receiveProposal(proposal);
      } catch (cause) {
        if (ownGeneration !== generation) return;
        analyzed = null;
        store.failAnalysis(controlledAnalysisMessage(cause));
      }
    },
    cancelPending() {
      generation += 1;
      analyzed = null;
    },
    applyCurrentProposal() {
      if (!analyzed || analyzed.proposal.moves.length === 0) return { ok: false, reason: 'invalid-proposal' };
      const result = applyMoves(analyzed.proposal.moves, analyzed.fingerprint);
      analyzed = null;
      return result;
    },
  };
};
