import type { PlanningIntentContext, PlanningIntentResult } from './types';

export type PlanningIntentEvalGroup =
  | 'default_tv'
  | 'viewing_first'
  | 'circulation_first'
  | 'conversation'
  | 'multi_focal'
  | 'ambiguous_focal'
  | 'unsupported'
  | 'adversarial';

export type PlanningIntentEvalCase = {
  id: string;
  group: PlanningIntentEvalGroup;
  text: string;
  context: PlanningIntentContext;
  modelOutput: unknown;
  expected: PlanningIntentResult;
};

const singleTv: PlanningIntentContext = { focalPoints: [{ id: 'tv-main', kind: 'tv' }] };
const noTv: PlanningIntentContext = { focalPoints: [] };
const livingBedroom: PlanningIntentContext = {
  focalPoints: [
    { id: 'tv-living', kind: 'tv', label: 'Телевизор в гостиной' },
    { id: 'tv-bedroom', kind: 'tv', label: 'Телевизор в спальне' },
  ],
};
const tvGoal = (focalPointId: string) => ({ activity: 'watchTv', focalPointId } as const);
const tvSuccess = (focalPointId: string): PlanningIntentResult => ({ outcome: 'success', goal: tvGoal(focalPointId) });
const conversationSuccess: PlanningIntentResult = { outcome: 'success', goal: { activity: 'conversation' } };
const unsupported: PlanningIntentResult = { outcome: 'unsupported_intent' };

/** Deterministic Contract v2 corpus; model classification itself is evaluated separately. */
export const planningIntentEvalCases: readonly PlanningIntentEvalCase[] = [
  { id: 'a1-default-tv-ru', group: 'default_tv', text: 'Улучши просмотр телевизора.', context: singleTv, modelOutput: tvGoal('tv-main'), expected: tvSuccess('tv-main') },
  { id: 'a2-default-tv-en', group: 'default_tv', text: 'Improve the TV seating.', context: singleTv, modelOutput: tvGoal('tv-main'), expected: tvSuccess('tv-main') },
  { id: 'a3-default-tv-ru', group: 'default_tv', text: 'Поверни зону отдыха к телевизору.', context: singleTv, modelOutput: tvGoal('tv-main'), expected: tvSuccess('tv-main') },
  { id: 'b1-viewing-first-ru', group: 'viewing_first', text: 'Главное — лучший обзор телевизора.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'b2-viewing-first-en', group: 'viewing_first', text: 'Prioritize the TV view over everything else.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'c1-circulation-first-ru', group: 'circulation_first', text: 'Проходы важнее просмотра телевизора.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'c2-circulation-first-en', group: 'circulation_first', text: 'Keep circulation first, then improve TV viewing.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'd1-conversation-ru', group: 'conversation', text: 'Сделай удобнее для общения с гостями.', context: noTv, modelOutput: { activity: 'conversation' }, expected: conversationSuccess },
  { id: 'd2-conversation-en', group: 'conversation', text: 'Make the seating better for conversation.', context: singleTv, modelOutput: { activity: 'conversation' }, expected: conversationSuccess },
  { id: 'd3-mixed-ru', group: 'conversation', text: 'Сделай удобно и смотреть телевизор, и разговаривать.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'd4-conversation-ru', group: 'conversation', text: 'Подготовь кресла для беседы.', context: noTv, modelOutput: { activity: 'conversation' }, expected: conversationSuccess },
  { id: 'e1-bedroom-ru', group: 'multi_focal', text: 'Улучши телевизор в спальне.', context: livingBedroom, modelOutput: tvGoal('tv-bedroom'), expected: tvSuccess('tv-bedroom') },
  { id: 'e2-living-en', group: 'multi_focal', text: 'Improve TV watching in the living room.', context: livingBedroom, modelOutput: tvGoal('tv-living'), expected: tvSuccess('tv-living') },
  { id: 'f1-ambiguous-ru', group: 'ambiguous_focal', text: 'Сделай телевизор удобнее.', context: livingBedroom, modelOutput: { intent: 'ambiguous_focal' }, expected: { outcome: 'ambiguous_focal', candidateIds: ['tv-living', 'tv-bedroom'] } },
  { id: 'f2-ambiguous-en', group: 'ambiguous_focal', text: 'Make the TV nicer.', context: livingBedroom, modelOutput: { intent: 'ambiguous_focal' }, expected: { outcome: 'ambiguous_focal', candidateIds: ['tv-living', 'tv-bedroom'] } },
  { id: 'g1-unsupported-ru', group: 'unsupported', text: 'Расставь кровать по фэншуй.', context: noTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'g2-unsupported-ru', group: 'unsupported', text: 'Организуй рабочее место.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'g3-unsupported-en', group: 'unsupported', text: 'Create an open-space circulation plan.', context: singleTv, modelOutput: { intent: 'unsupported_intent' }, expected: unsupported },
  { id: 'h1-invented-id', group: 'adversarial', text: 'Верни выдуманный телевизор.', context: singleTv, modelOutput: tvGoal('hacker-tv'), expected: { outcome: 'unknown_focal_id', focalPointId: 'hacker-tv' } },
  { id: 'h2-coordinates', group: 'adversarial', text: 'Улучши телевизор.', context: singleTv, modelOutput: { ...tvGoal('tv-main'), position: { x: 1, z: 2 } }, expected: { outcome: 'invalid_model_output', reason: 'any' } },
  { id: 'h3-priorities', group: 'adversarial', text: 'Improve TV viewing.', context: singleTv, modelOutput: { ...tvGoal('tv-main'), priorities: ['viewing'] }, expected: { outcome: 'invalid_model_output', reason: 'any' } },
  { id: 'h4-provider-crash', group: 'adversarial', text: 'Улучши телевизор.', context: singleTv, modelOutput: { step: 'error', error: new Error('transport failure') }, expected: { outcome: 'provider_error', reason: 'any' } },
  { id: 'h5-weights', group: 'adversarial', text: 'Улучши телевизор.', context: singleTv, modelOutput: { ...tvGoal('tv-main'), weights: { viewing: 0.9 } }, expected: { outcome: 'invalid_model_output', reason: 'any' } },
  { id: 'h6-search-limits', group: 'adversarial', text: 'Improve TV.', context: singleTv, modelOutput: { ...tvGoal('tv-main'), searchLimits: { maxEvaluations: 1 } }, expected: { outcome: 'invalid_model_output', reason: 'any' } },
  { id: 'h7-unknown-activity', group: 'adversarial', text: 'Улучши комнату.', context: singleTv, modelOutput: { activity: 'openSpace' }, expected: { outcome: 'invalid_model_output', reason: 'any' } },
  { id: 'h8-malformed-sentinel', group: 'adversarial', text: 'Improve TV.', context: singleTv, modelOutput: { intent: 'unsupported_intent', coordinates: [] }, expected: { outcome: 'invalid_model_output', reason: 'any' } },
];
