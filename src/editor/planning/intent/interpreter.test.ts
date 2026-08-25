import { describe, expect, it } from 'vitest';
import { createFakePlanningIntentProvider } from './fakeProvider';
import { interpretPlanningIntent, MAX_PLANNING_INTENT_TEXT_LENGTH } from './interpreter';
import { PlanningIntentInputError } from './inputError';
import type { PlanningIntentContext } from './types';

const singleTv: PlanningIntentContext = { focalPoints: [{ id: 'tv-main', kind: 'tv' }] };
const providerFor = (value: unknown) => createFakePlanningIntentProvider({ step: 'output', value });

describe('planning intent input and context hygiene', () => {
  it.each(['', '   '])('rejects blank text before provider invocation', async (text) => {
    const provider = providerFor({ activity: 'conversation' });
    await expect(interpretPlanningIntent(text, singleTv, provider)).rejects.toThrow(PlanningIntentInputError);
    expect(provider.requests).toEqual([]);
  });

  it('rejects oversized text and malformed contexts', async () => {
    const provider = providerFor({ activity: 'conversation' });
    await expect(interpretPlanningIntent('x'.repeat(MAX_PLANNING_INTENT_TEXT_LENGTH + 1), singleTv, provider))
      .rejects.toThrow(PlanningIntentInputError);
    await expect(interpretPlanningIntent('x', { focalPoints: 'bad' } as unknown as PlanningIntentContext, provider))
      .rejects.toThrow(PlanningIntentInputError);
    expect(provider.requests).toEqual([]);
  });

  it('rejects blank, duplicate, and unsupported focal entries', async () => {
    const provider = providerFor({ activity: 'conversation' });
    const contexts = [
      { focalPoints: [{ id: ' ', kind: 'tv' }] },
      { focalPoints: [{ id: 'tv', kind: 'tv' }, { id: 'tv', kind: 'tv' }] },
      { focalPoints: [{ id: 'x', kind: 'sofa' }] },
    ] as unknown as PlanningIntentContext[];
    for (const context of contexts) {
      await expect(interpretPlanningIntent('x', context, provider)).rejects.toThrow(PlanningIntentInputError);
    }
  });

  it('accepts zero TV focals and sends only trimmed minimal context', async () => {
    const provider = providerFor({ activity: 'conversation' });
    await expect(interpretPlanningIntent('  Conversation  ', { focalPoints: [] }, provider)).resolves.toEqual({
      outcome: 'success', goal: { activity: 'conversation' },
    });
    expect(provider.requests).toEqual([{ userText: 'Conversation', focalPoints: [] }]);
  });

  it('does not mutate or retain room data beyond focal descriptors', async () => {
    const context: PlanningIntentContext = {
      focalPoints: [{ id: 'tv-main', kind: 'tv', label: 'Living room' }],
    };
    const snapshot = structuredClone(context);
    const provider = providerFor({ activity: 'watchTv', focalPointId: 'tv-main' });
    await interpretPlanningIntent('TV', context, provider);
    expect(context).toEqual(snapshot);
    expect(provider.requests).toEqual([{
      userText: 'TV', focalPoints: [{ id: 'tv-main', kind: 'tv', label: 'Living room' }],
    }]);
    const serialized = JSON.stringify(provider.requests[0]);
    for (const forbidden of ['position', 'rotation', 'footprint', 'scene', 'project', 'asset']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('Planning Contract v2 interpretation', () => {
  it('accepts TV with a known focal and Conversation without a focal', async () => {
    await expect(interpretPlanningIntent('TV', singleTv, providerFor({ activity: 'watchTv', focalPointId: 'tv-main' })))
      .resolves.toEqual({ outcome: 'success', goal: { activity: 'watchTv', focalPointId: 'tv-main' } });
    await expect(interpretPlanningIntent('Talk', singleTv, providerFor({ activity: 'conversation' })))
      .resolves.toEqual({ outcome: 'success', goal: { activity: 'conversation' } });
  });

  it('rejects invented TV focal IDs contextually', async () => {
    await expect(interpretPlanningIntent('TV', singleTv, providerFor({ activity: 'watchTv', focalPointId: 'invented' })))
      .resolves.toEqual({ outcome: 'unknown_focal_id', focalPointId: 'invented' });
  });

  it.each([
    { activity: 'watchTv', focalPointId: 'tv-main', priorities: ['viewing'] },
    { activity: 'watchTv', focalPointId: 'tv-main', coordinates: { x: 1, z: 2 } },
    { activity: 'watchTv', focalPointId: 'tv-main', weights: { viewing: 1 } },
    { activity: 'watchTv', focalPointId: 'tv-main', candidates: [] },
    { activity: 'watchTv', focalPointId: 'tv-main', searchLimits: { maxEvaluations: 1 } },
    { activity: 'conversation', focalPointId: 'room' },
    { activity: 'dance' },
  ])('rejects untrusted incompatible output %#', async (output) => {
    await expect(interpretPlanningIntent('request', singleTv, providerFor(output))).resolves.toMatchObject({
      outcome: 'invalid_model_output',
    });
  });

  it('maps supported sentinels without guessing', async () => {
    await expect(interpretPlanningIntent('x', singleTv, providerFor({ intent: 'unsupported_intent' })))
      .resolves.toEqual({ outcome: 'unsupported_intent' });
    const context: PlanningIntentContext = { focalPoints: [{ id: 'tv-a', kind: 'tv' }, { id: 'tv-b', kind: 'tv' }] };
    await expect(interpretPlanningIntent('x', context, providerFor({ intent: 'ambiguous_focal' })))
      .resolves.toEqual({ outcome: 'ambiguous_focal', candidateIds: ['tv-a', 'tv-b'] });
  });

  it('rejects malformed sentinels and maps provider failures', async () => {
    await expect(interpretPlanningIntent('x', singleTv, providerFor({ intent: 'unsupported_intent', extra: true })))
      .resolves.toMatchObject({ outcome: 'invalid_model_output' });
    const provider = createFakePlanningIntentProvider({ step: 'error', error: new Error('offline') });
    await expect(interpretPlanningIntent('x', singleTv, provider))
      .resolves.toEqual({ outcome: 'provider_error', reason: 'offline' });
  });
});
