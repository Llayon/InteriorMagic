import { describe, expect, it, vi } from 'vitest';
import { validatePlanningIntentContext } from './context';
import { createFakePlanningIntentProvider } from './fakeProvider';
import { interpretPlanningIntent, MAX_PLANNING_INTENT_TEXT_LENGTH } from './interpreter';
import { PlanningIntentInputError } from './inputError';
import type { PlanningIntentContext, PlanningIntentResult } from './types';

const singleTv: PlanningIntentContext = { focalPoints: [{ id: 'tv-main', kind: 'tv' }] };

const goalOutput = (extra: Record<string, unknown> = {}) => ({
  activity: 'watchTv',
  focalPointId: 'tv-main',
  ...extra,
});

describe('planning intent input hygiene (thrown before provider invocation)', () => {
  it('rejects empty and whitespace-only requests before invoking the provider', async () => {
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    await expect(interpretPlanningIntent('', singleTv, provider)).rejects.toThrow(PlanningIntentInputError);
    await expect(interpretPlanningIntent('   \n\t ', singleTv, provider)).rejects.toThrow(PlanningIntentInputError);
    expect(provider.requests).toHaveLength(0);
  });

  it('rejects oversized requests before invoking the provider', async () => {
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    const longText = 'а'.repeat(MAX_PLANNING_INTENT_TEXT_LENGTH + 1);
    await expect(interpretPlanningIntent(longText, singleTv, provider)).rejects.toThrow(
      PlanningIntentInputError,
    );
    expect(provider.requests).toHaveLength(0);
  });

  it('trims surrounding whitespace from the request sent to the provider', async () => {
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    await interpretPlanningIntent('  Улучши просмотр телевизора.  ', singleTv, provider);
    expect(provider.requests[0]?.userText).toBe('Улучши просмотр телевизора.');
  });
});

describe('planning intent context validation (thrown before provider invocation)', () => {
  it('rejects malformed contexts', () => {
    expect(() =>
      validatePlanningIntentContext(undefined as unknown as PlanningIntentContext),
    ).toThrow(PlanningIntentInputError);
    expect(() =>
      validatePlanningIntentContext({ focalPoints: 'nope' } as unknown as PlanningIntentContext),
    ).toThrow(PlanningIntentInputError);
  });

  it('rejects blank focal IDs', () => {
    expect(() =>
      validatePlanningIntentContext({ focalPoints: [{ id: '   ', kind: 'tv' }] }),
    ).toThrow(/non-empty/);
  });

  it('rejects duplicate focal IDs', () => {
    expect(() =>
      validatePlanningIntentContext({
        focalPoints: [
          { id: 'tv-main', kind: 'tv' },
          { id: 'tv-main', kind: 'tv', label: 'dup' },
        ],
      }),
    ).toThrow(/Duplicate focal point ID: tv-main/);
  });

  it('rejects unsupported focal kinds and malformed entries', () => {
    expect(() =>
      validatePlanningIntentContext({
        focalPoints: [{ id: 'sp-1', kind: 'speaker' }] as unknown as PlanningIntentContext['focalPoints'],
      }),
    ).toThrow(/Unsupported focal point kind/);
    expect(() =>
      validatePlanningIntentContext({
        focalPoints: [{ kind: 'tv' }] as unknown as PlanningIntentContext['focalPoints'],
      }),
    ).toThrow(PlanningIntentInputError);
  });

  it('rejects contexts with zero usable TV focals before invoking the provider', async () => {
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    await expect(
      interpretPlanningIntent('Улучши телевизор', { focalPoints: [] }, provider),
    ).rejects.toThrow(/at least one usable TV focal point/);
    expect(provider.requests).toHaveLength(0);
  });
});

describe('planning intent interpretation outcomes (returned as values)', () => {
  it('parses valid provider output into a PlanningGoal with omitted priorities preserved', async () => {
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    const result = await interpretPlanningIntent('Сделай диван удобнее для просмотра ТВ.', singleTv, provider);
    expect(result).toEqual({ outcome: 'success', goal: { activity: 'watchTv', focalPointId: 'tv-main' } });
  });

  it('preserves full ordered priorities exactly as returned', async () => {
    const provider = createFakePlanningIntentProvider({
      step: 'output',
      value: goalOutput({ priorities: ['circulation', 'viewing', 'conversation'] }),
    });
    const result = await interpretPlanningIntent('Не мешай проходу, потом вид, потом разговор.', singleTv, provider);
    expect(result).toEqual({
      outcome: 'success',
      goal: {
        activity: 'watchTv',
        focalPointId: 'tv-main',
        priorities: ['circulation', 'viewing', 'conversation'],
      },
    });
  });

  it('preserves partial ordered priority subsets', async () => {
    for (const priorities of [['viewing'], ['conversation', 'viewing'], ['circulation']]) {
      const provider = createFakePlanningIntentProvider({
        step: 'output',
        value: goalOutput({ priorities }),
      });
      const result: PlanningIntentResult = await interpretPlanningIntent(
        'Главное не перекрывать проход.',
        singleTv,
        provider,
      );
      expect(result).toEqual({ outcome: 'success', goal: goalOutput({ priorities }) });
    }
  });

  it('rejects model extra fields such as injected coordinates', async () => {
    const provider = createFakePlanningIntentProvider({
      step: 'output',
      value: goalOutput({ position: { x: 1, z: 2 }, move: true }),
    });
    const result = await interpretPlanningIntent('Улучши ТВ.', singleTv, provider);
    expect(result).toMatchObject({ outcome: 'invalid_model_output' });
    if (result.outcome === 'invalid_model_output') expect(result.reason).toContain('position');
  });

  it('rejects numerical weights — they can never enter PlanningGoal', async () => {
    const provider = createFakePlanningIntentProvider({
      step: 'output',
      value: goalOutput({ viewing: 0.7, circulation: 0.2 }),
    });
    const result = await interpretPlanningIntent('Улучши ТВ.', singleTv, provider);
    expect(result.outcome).toBe('invalid_model_output');
  });

  it('rejects unknown activities without expanding Contract v1', async () => {
    const provider = createFakePlanningIntentProvider({
      step: 'output',
      value: { activity: 'fengShui', focalPointId: 'tv-main' },
    });
    const result = await interpretPlanningIntent('Расставь по фэншуй.', singleTv, provider);
    expect(result).toMatchObject({ outcome: 'invalid_model_output' });
    if (result.outcome === 'invalid_model_output') expect(result.reason).toContain('activity');
  });

  it('rejects duplicate and unknown priorities via structural validation', async () => {
    const duplicate = createFakePlanningIntentProvider({
      step: 'output',
      value: goalOutput({ priorities: ['viewing', 'viewing'] }),
    });
    await expect(interpretPlanningIntent('ТВ.', singleTv, duplicate)).resolves.toMatchObject({
      outcome: 'invalid_model_output',
    });

    const unknown = createFakePlanningIntentProvider({
      step: 'output',
      value: goalOutput({ priorities: ['magic'] }),
    });
    await expect(interpretPlanningIntent('ТВ.', singleTv, unknown)).resolves.toMatchObject({
      outcome: 'invalid_model_output',
    });
  });

  it('rejects invented focal IDs contextually against the supplied IntentContext', async () => {
    const provider = createFakePlanningIntentProvider({
      step: 'output',
      value: { activity: 'watchTv', focalPointId: 'invented-tv' },
    });
    const result = await interpretPlanningIntent('Сделай телевизор удобнее.', singleTv, provider);
    expect(result).toEqual({ outcome: 'unknown_focal_id', focalPointId: 'invented-tv' });
  });

  it('maps provider exceptions to PROVIDER_ERROR values without throwing', async () => {
    const provider = createFakePlanningIntentProvider({
      step: 'error',
      error: new Error('transport down'),
    });
    const result = await interpretPlanningIntent('Улучши ТВ.', singleTv, provider);
    expect(result).toEqual({ outcome: 'provider_error', reason: 'transport down' });
  });

  it('maps the unsupported-intent sentinel to UNSUPPORTED_INTENT', async () => {
    const provider = createFakePlanningIntentProvider({ step: 'output', value: { intent: 'unsupported_intent' } });
    const result = await interpretPlanningIntent('Организуй рабочее место.', singleTv, provider);
    expect(result).toEqual({ outcome: 'unsupported_intent' });
  });

  it('maps the ambiguous-focal sentinel to AMBIGUOUS_FOCAL with candidate IDs', async () => {
    const context: PlanningIntentContext = {
      focalPoints: [
        { id: 'tv-living', kind: 'tv', label: 'Телевизор в гостиной' },
        { id: 'tv-bedroom', kind: 'tv', label: 'Телевизор в спальне' },
      ],
    };
    const provider = createFakePlanningIntentProvider({ step: 'output', value: { intent: 'ambiguous_focal' } });
    const result = await interpretPlanningIntent('Сделай телевизор удобнее.', context, provider);
    expect(result).toEqual({ outcome: 'ambiguous_focal', candidateIds: ['tv-living', 'tv-bedroom'] });
  });

  it('never guesses an ambiguous focal even when labels are distinct', async () => {
    // Track B itself never resolves multi-focal ambiguity on behalf of the
    // user; the provider is instructed to return the ambiguous sentinel and
    // the interpreter maps it without guessing.
    const context: PlanningIntentContext = {
      focalPoints: [
        { id: 'tv-a', kind: 'tv', label: 'A' },
        { id: 'tv-b', kind: 'tv', label: 'B' },
      ],
    };
    const provider = createFakePlanningIntentProvider({ step: 'output', value: { intent: 'ambiguous_focal' } });
    const result = await interpretPlanningIntent('Сделай телевизор удобнее.', context, provider);
    expect(result.outcome).toBe('ambiguous_focal');
  });

  it('rejects malformed or unknown sentinels strictly', async () => {
    const mixed = createFakePlanningIntentProvider({
      step: 'output',
      value: { intent: 'unsupported_intent', focalPointId: 'tv-main' },
    });
    await expect(interpretPlanningIntent('ТВ.', singleTv, mixed)).resolves.toMatchObject({
      outcome: 'invalid_model_output',
    });

    const unknownSentinel = createFakePlanningIntentProvider({
      step: 'output',
      value: { intent: 'hax' },
    });
    await expect(interpretPlanningIntent('ТВ.', singleTv, unknownSentinel)).resolves.toMatchObject({
      outcome: 'invalid_model_output',
    });
  });
});

describe('trust boundary and purity guarantees', () => {
  it('does not mutate the original context', async () => {
    const context: PlanningIntentContext = {
      focalPoints: [{ id: 'tv-main', kind: 'tv', label: 'Гостиная' }],
    };
    const snapshot = JSON.stringify(context);
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    await interpretPlanningIntent('Улучши ТВ.', context, provider);
    expect(JSON.stringify(context)).toBe(snapshot);
  });

  it('sends only minimal context to the provider — never RoomProject or geometry', async () => {
    const context: PlanningIntentContext = {
      focalPoints: [
        { id: 'tv-living', kind: 'tv', label: 'Гостиная' },
        { id: 'tv-bedroom', kind: 'tv' },
      ],
    };
    const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
    await interpretPlanningIntent('Улучши ТВ в гостиной.', context, provider);

    expect(provider.requests).toHaveLength(1);
    const request = provider.requests[0];
    expect(request?.userText).toBe('Улучши ТВ в гостиной.');
    expect(request?.focalPoints).toEqual([
      { id: 'tv-living', kind: 'tv', label: 'Гостиная' },
      { id: 'tv-bedroom', kind: 'tv' },
    ]);
    const serialized = JSON.stringify(request);
    for (const forbidden of ['position', 'rotation', 'footprint', 'scene', 'project', 'asset']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('requires no network — succeeds with fetch disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network must not be used in unit tests');
      }),
    );
    try {
      const provider = createFakePlanningIntentProvider({ step: 'output', value: goalOutput() });
      const result = await interpretPlanningIntent('Improve the TV seating.', singleTv, provider);
      expect(result).toEqual({ outcome: 'success', goal: { activity: 'watchTv', focalPointId: 'tv-main' } });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

