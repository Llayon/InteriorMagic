import type { RoomProject } from '@/editor/model/types';
import type { PlanProposal } from '@/editor/planning/contracts';
import type { PlannerApplyResult, PlannerOrchestrator } from '@/editor/planning/application/types';
import {
  interpretPlanningIntent,
  type PlanningIntentProvider,
  type PlanningIntentResult,
} from '@/editor/planning/intent';
import { planTvViewing } from '@/editor/planning/tv';
import { projectPlanningScene, type AssetDefinitionResolver } from './projectPlanningScene';
import { resolveSingleTvFocalId } from '@/editor/planning/tv';
import { planningProjectFingerprint } from './projectFingerprint';
import type { PlanningIntentAnalysisPort } from './planningIntentAnalysisPort';
import { PlanningError, type PlanningScene } from '@/editor/planning/livingRoom';
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
  if (cause instanceof PlanningError) {
    switch (cause.code) {
      case 'FOCAL_NOT_FOUND':
        return 'В комнате не найден поддерживаемый телевизор.';
      case 'FOCAL_AMBIGUOUS':
        return 'Найдено несколько телевизоров. Выбор цели пока не поддерживается.';
      case 'CURRENT_LAYOUT_INVALID':
        return 'Текущая расстановка нарушает обязательные ограничения планировщика.';
      case 'INVALID_PROJECT':
      case 'UNKNOWN_ASSET':
      case 'UNSUPPORTED_PLACEMENT':
      case 'UNSUPPORTED_LAYOUT':
      case 'INVALID_SCENE':
      case 'INVALID_ACTIVE_GROUP':
        return 'Текущая комната пока не поддерживается планировщиком.';
      case 'SEARCH_LIMIT_EXCEEDED':
        return 'Не удалось безопасно завершить планирование расстановки.';
      case 'NO_VALID_PLAN':
        // The engine currently reports this as a normal no-op PlanProposal;
        // keep a controlled mapping if a future adapter propagates the code.
        return 'Не удалось найти допустимую расстановку.';
    }
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
    const scene = projectPlanningScene(project, resolveAsset);
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
      throw new PlanningError('INVALID_PROJECT', 'Project changed during analysis');
    }
    const proposal = plan(scene, goal);
    if (ownGeneration !== generation) return;
    const currentProject = readProject();
    if (planningProjectFingerprint(currentProject) !== fingerprint) {
      throw new PlanningError('INVALID_PROJECT', 'Project changed during analysis');
    }
    const currentIds = new Set(currentProject.objects.map((object) => object.instanceId));
    if (proposal.moves.some((move) => !currentIds.has(move.instanceId))) {
      throw new PlanningError('INVALID_PROJECT', 'Proposal contains missing targets');
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
          throw new PlanningError('INVALID_PROJECT', 'Project changed during intent analysis');
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
