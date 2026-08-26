import { describe, expect, it } from 'vitest';
import { buildPlanningIntentOutputSchema, planningIntentSystemPrompt } from './prompt';

describe('Planning Contract v2 provider instructions', () => {
  const branchEnums = (focalIds: readonly string[]) => {
    const schema = buildPlanningIntentOutputSchema(focalIds);
    return schema.schema.oneOf.map((branch) => {
      const activity = branch.properties['activity'];
      const intent = branch.properties['intent'];
      return activity?.enum[0] ?? intent?.enum[0];
    });
  };

  it('exposes strict TV, focal-free Conversation, and controlled sentinel branches', () => {
    const schema = buildPlanningIntentOutputSchema(['tv-a', 'tv-b']);
    expect(schema.name).toBe('planning_goal_v2');
    const branches = schema.schema.oneOf;
    expect(branches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        additionalProperties: false,
        required: ['activity', 'focalPointId'],
        properties: expect.objectContaining({
          activity: { type: 'string', enum: ['watchTv'] },
          focalPointId: { type: 'string', enum: ['tv-a', 'tv-b'] },
        }),
      }),
      {
        type: 'object', additionalProperties: false, required: ['activity'],
        properties: { activity: { type: 'string', enum: ['conversation'] } },
      },
    ]));
    expect(JSON.stringify(schema)).not.toContain('priorities');
  });

  it('makes TV and ambiguous-focal branches match focal cardinality', () => {
    expect(branchEnums([])).toEqual(['conversation', 'unsupported_intent']);
    expect(branchEnums(['tv-a'])).toEqual(['watchTv', 'conversation', 'unsupported_intent']);
    expect(branchEnums(['tv-a', 'tv-b'])).toEqual([
      'watchTv', 'conversation', 'unsupported_intent', 'ambiguous_focal',
    ]);
  });

  it('instructs the provider to classify unsupported tuning and multi-activity requests', () => {
    expect(planningIntentSystemPrompt).toContain('priorities, relative preferences, planner tuning, or trade-offs');
    expect(planningIntentSystemPrompt).toContain('combines watchTv and conversation');
    for (const forbidden of ['coordinates', 'numeric weights']) {
      expect(planningIntentSystemPrompt).toContain(forbidden);
    }
  });
});
