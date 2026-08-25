import { describe, expect, it } from 'vitest';
import { buildPlanningIntentOutputSchema, planningIntentSystemPrompt } from './prompt';

describe('Planning Contract v2 provider instructions', () => {
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

  it('rejects tuning and multi-activity requests instead of silently dropping intent', () => {
    expect(planningIntentSystemPrompt).toContain('priorities, relative preferences, planner tuning, or trade-offs');
    expect(planningIntentSystemPrompt).toContain('combines watchTv and conversation');
    for (const forbidden of ['coordinates', 'numeric weights']) {
      expect(planningIntentSystemPrompt).toContain(forbidden);
    }
  });
});
