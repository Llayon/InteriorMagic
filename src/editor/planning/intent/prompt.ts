import type { PlanningEntityId } from '../contracts';

/**
 * Minimal intent-only instructions. The model interprets the user request; it
 * does NOT solve the room. This prompt deliberately contains no planner
 * scoring weights, no room geometry, no candidate generation, no SAT/collision
 * implementation details and no reasoning request.
 */
export const planningIntentSystemPrompt = [
  'You convert an interior design user request into a strict JSON planning goal.',
  '',
  'Rules:',
  '- The only supported activity is "watchTv".',
  '- If the request is not about making TV watching better, reply {"intent":"unsupported_intent"}.',
  '- Choose "focalPointId" ONLY from the IDs listed in the context. Never invent an ID.',
  '- If several focal points are listed and the request does not clearly identify one of them, reply {"intent":"ambiguous_focal"} instead of guessing.',
  '- "priorities" is OPTIONAL: an ordered array of unique values from ["viewing","circulation","conversation"], most important first.',
  '- Omit "priorities" when the request expresses no relative preference.',
  '- Reply with a single JSON object and nothing else. Do not explain your reasoning.',
  '- Never output coordinates, geometry, distances, numeric weights or any other planner parameters.',
].join('\n');

/**
 * Tiny JSON-Schema-shaped description of the allowed output, built from the
 * IDs explicitly supplied in the IntentContext. Track B owns this schema;
 * parsePlanningGoal() remains the final structural authority regardless of
 * what any provider-side schema enforcement does. No schema library involved.
 */
export const buildPlanningIntentOutputSchema = (allowedFocalIds: readonly PlanningEntityId[]) => ({
  name: 'planning_goal_v1',
  strict: true,
  schema: {
    type: 'object',
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['activity', 'focalPointId'],
        properties: {
          activity: { type: 'string', enum: ['watchTv'] },
          focalPointId: { type: 'string', enum: [...allowedFocalIds] },
          priorities: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'string', enum: ['viewing', 'circulation', 'conversation'] },
          },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['intent'],
        properties: {
          intent: { type: 'string', enum: ['unsupported_intent', 'ambiguous_focal'] },
        },
      },
    ],
  },
});
