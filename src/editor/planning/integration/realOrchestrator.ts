import type { RoomProject } from '@/editor/model/types';
import type { PlanProposal } from '@/editor/planning/contracts';
import type { PlannerApplyResult, PlannerOrchestrator } from '@/editor/planning/application/types';
import {
  interpretPlanningIntent,
  type PlanningIntentProvider,
  type PlanningIntentResult,
} from '@/editor/planning/intent';
import { planTvViewing } from '@/editor/planning/tv';
import { buildPlanningScene, PlanningSceneBuildError, resolveSingleTvFocalId, type AssetDefinitionResolver } from './buildPlanningScene';
import { planningProjectFingerprint } from './projectFingerprint';
import type { PlanningIntentAnalysisPort } from './planningIntentAnalysisPort';
import type { PlanningScene } from '@/editor/planning/livingRoom';
import type { PlanningGoal } from '@/editor/planning/contracts';

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
  createIntentProvider?: (signal: AbortSignal) => PlanningIntentProvider;
  plan?: typeof planTvViewing;
}

export type RealPlannerOrchestrator = PlannerOrchestrator & PlanningIntentAnalysisPort;

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

const controlledIntentMessage = (result: Exclude<PlanningIntentResult, { outcome: 'success' }>): string => {
  if (result.outcome === 'unsupported_intent') return 'Этот запрос пока не поддерживается планировщиком.';
  if (result.outcome === 'ambiguous_focal') return 'Не удалось однозначно определить цель планирования.';
  if (result.outcome === 'unknown_focal_id') return 'Модель выбрала неизвестную цель. Попробуйте сформулировать запрос ещё раз.';
  if (result.outcome === 'provider_error') return 'Сервис интерпретации запроса временно недоступен.';
  return 'Не удалось безопасно интерпретировать запрос.';
};

export const createRealPlannerOrchestrator = ({
  readProject,
  store,
  applyMoves,
  resolveAsset,
  beforeAnalysis = () => Promise.resolve(),
  createIntentProvider,
  plan = planTvViewing,
}: RealPlannerDependencies): RealPlannerOrchestrator => {
  let generation = 0;
  let analyzed: { proposal: PlanProposal; fingerprint: string } | null = null;
  let activeIntentRequest: AbortController | null = null;

  const startAnalysis = (): number => {
    activeIntentRequest?.abort();
    activeIntentRequest = null;
    analyzed = null;
    store.beginAnalysis();
    return ++generation;
  };

  const prepare = (): { scene: PlanningScene; fingerprint: string; focalPointId: string } => {
    const project = readProject();
    const fingerprint = planningProjectFingerprint(project);
    const scene = buildPlanningScene(project, resolveAsset);
    return { scene, fingerprint, focalPointId: resolveSingleTvFocalId(scene) };
  };

  const publishGoal = (
    ownGeneration: number,
    scene: PlanningScene,
    fingerprint: string,
    goal: PlanningGoal,
  ): void => {
    if (ownGeneration !== generation) return;
    if (planningProjectFingerprint(readProject()) !== fingerprint) {
      throw new PlanningSceneBuildError('invalid-project', 'Project changed during analysis');
    }
    const proposal = plan(scene, goal);
    if (ownGeneration !== generation) return;
    const currentProject = readProject();
    if (planningProjectFingerprint(currentProject) !== fingerprint) {
      throw new PlanningSceneBuildError('invalid-project', 'Project changed during analysis');
    }
    const currentIds = new Set(currentProject.objects.map((object) => object.instanceId));
    if (proposal.moves.some((move) => !currentIds.has(move.instanceId))) {
      throw new PlanningSceneBuildError('invalid-project', 'Proposal contains missing targets');
    }
    analyzed = { proposal, fingerprint };
    store.receiveProposal(proposal);
  };

  return {
    async beginAnalysis() {
      const ownGeneration = startAnalysis();
      await beforeAnalysis();
      if (ownGeneration !== generation) return;
      try {
        const prepared = prepare();
        publishGoal(ownGeneration, prepared.scene, prepared.fingerprint, {
          activity: 'watchTv', focalPointId: prepared.focalPointId,
        });
      } catch (cause) {
        if (ownGeneration !== generation) return;
        analyzed = null;
        store.failAnalysis(controlledAnalysisMessage(cause));
      }
    },
    async beginAnalysisFromText(text: string) {
      const ownGeneration = startAnalysis();
      await beforeAnalysis();
      if (ownGeneration !== generation) return;
      try {
        if (!createIntentProvider) throw new Error('Planning intent provider is not configured');
        const prepared = prepare();
        const controller = new AbortController();
        activeIntentRequest = controller;
        const result = await interpretPlanningIntent(text, {
          focalPoints: [{ id: prepared.focalPointId, kind: 'tv' }],
        }, createIntentProvider(controller.signal));
        if (activeIntentRequest === controller) activeIntentRequest = null;
        if (ownGeneration !== generation) return;
        if (planningProjectFingerprint(readProject()) !== prepared.fingerprint) {
          throw new PlanningSceneBuildError('invalid-project', 'Project changed during intent analysis');
        }
        if (result.outcome !== 'success') {
          analyzed = null;
          store.failAnalysis(controlledIntentMessage(result));
          return;
        }
        publishGoal(ownGeneration, prepared.scene, prepared.fingerprint, result.goal);
      } catch (cause) {
        if (ownGeneration !== generation) return;
        activeIntentRequest = null;
        analyzed = null;
        store.failAnalysis(controlledAnalysisMessage(cause));
      }
    },
    cancelPending() {
      generation += 1;
      activeIntentRequest?.abort();
      activeIntentRequest = null;
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
