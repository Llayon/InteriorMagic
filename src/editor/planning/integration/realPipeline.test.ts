import { describe, expect, it } from 'vitest';
import { createPlannerIntegrationProject, installPlannerIntegrationTestAssets } from '@/app/demo/plannerIntegrationRoom';
import { createEditorStore } from '@/editor/state/store';
import type { ProjectStorage } from '@/editor/serialization/project';
import { usePlannerStore } from '@/editor/planning/ui';
import { createRealPlannerOrchestrator } from './realOrchestrator';

const storage: ProjectStorage = { load: () => null, save: () => undefined, clear: () => undefined };

describe('real deterministic planner pipeline', () => {
  it('flows from live RoomProject through real preview and atomic Apply', async () => {
    installPlannerIntegrationTestAssets();
    const initial = createPlannerIntegrationProject('improved');
    const editor = createEditorStore(initial, storage);
    usePlannerStore.getState().reset();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => editor.getState().project,
      store: {
        beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
        receiveProposal: (proposal) => usePlannerStore.getState().receiveProposal(proposal),
        failAnalysis: (error) => usePlannerStore.getState().failAnalysis(error),
      },
      applyMoves: (moves, fingerprint) => editor.getState().applyPlanningMovesAtomic(moves, fingerprint),
    });
    await orchestrator.beginAnalysis();
    expect(usePlannerStore.getState().status).toBe('ready');
    expect(usePlannerStore.getState().proposal?.moves.length).toBeGreaterThan(0);
    usePlannerStore.getState().enterPreview();
    expect(editor.getState().project).toEqual(initial);
    expect(editor.getState().session.undoStack).toHaveLength(0);
    expect(orchestrator.applyCurrentProposal?.()).toEqual({ ok: true });
    expect(editor.getState().project).not.toEqual(initial);
    expect(editor.getState().session.undoStack).toHaveLength(1);
    editor.getState().undo();
    expect(editor.getState().project).toEqual(initial);
  });

  it('flows from validated text intent through real Preview, Apply, Undo and Redo', async () => {
    installPlannerIntegrationTestAssets();
    const initial = createPlannerIntegrationProject('improved');
    const editor = createEditorStore(initial, storage);
    usePlannerStore.getState().reset();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => editor.getState().project,
      store: {
        beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
        receiveProposal: (proposal) => usePlannerStore.getState().receiveProposal(proposal),
        failAnalysis: (error) => usePlannerStore.getState().failAnalysis(error),
      },
      applyMoves: (moves, fingerprint) => editor.getState().applyPlanningMovesAtomic(moves, fingerprint),
      createIntentProvider: () => ({
        interpret: async () => ({
          activity: 'watchTv', focalPointId: 'room-object:test-tv',
        }),
      }),
    });
    await orchestrator.beginAnalysisFromText('Главное — свободный проход, затем просмотр');
    expect(usePlannerStore.getState().status).toBe('ready');
    expect(usePlannerStore.getState().proposal?.moves.length).toBeGreaterThan(0);
    usePlannerStore.getState().enterPreview();
    expect(editor.getState().project).toEqual(initial);
    expect(editor.getState().session.undoStack).toHaveLength(0);
    expect(orchestrator.applyCurrentProposal?.()).toEqual({ ok: true });
    const applied = structuredClone(editor.getState().project);
    expect(applied).not.toEqual(initial);
    expect(editor.getState().session.undoStack).toHaveLength(1);
    editor.getState().undo();
    expect(editor.getState().project).toEqual(initial);
    editor.getState().redo();
    expect(editor.getState().project).toEqual(applied);
  });

  it('applies a focal-free Conversation proposal in a zero-TV room', async () => {
    installPlannerIntegrationTestAssets();
    const initial = createPlannerIntegrationProject('no-tv');
    const editor = createEditorStore(initial, storage);
    usePlannerStore.getState().reset();
    const orchestrator = createRealPlannerOrchestrator({
      readProject: () => editor.getState().project,
      store: {
        beginAnalysis: () => usePlannerStore.getState().beginAnalysis(),
        receiveProposal: (proposal) => usePlannerStore.getState().receiveProposal(proposal),
        failAnalysis: (error) => usePlannerStore.getState().failAnalysis(error),
      },
      applyMoves: (moves, fingerprint) => editor.getState().applyPlanningMovesAtomic(moves, fingerprint),
      createIntentProvider: () => ({ interpret: async () => ({ activity: 'conversation' }) }),
    });
    await orchestrator.beginAnalysisFromText('Conversation');
    expect(usePlannerStore.getState().status).toBe('ready');
    expect(usePlannerStore.getState().proposal?.findings.some((finding) => finding.ruleId === 'conversation.facing')).toBe(true);
    usePlannerStore.getState().enterPreview();
    expect(editor.getState().project).toEqual(initial);
    expect(orchestrator.applyCurrentProposal?.()).toEqual({ ok: true });
    expect(editor.getState().project).not.toEqual(initial);
    editor.getState().undo();
    expect(editor.getState().project).toEqual(initial);
  });
});
