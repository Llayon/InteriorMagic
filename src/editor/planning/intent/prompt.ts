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
  '- The supported single activities are "watchTv" and "conversation".',
  '- For a TV-only request, output {"activity":"watchTv","focalPointId":"<allowed ID>"}.',
  '- For a conversation-only request, output exactly {"activity":"conversation"}. It has no focal point.',
  '- If the request combines watchTv and conversation, reply {"intent":"unsupported_intent"}.',
  '- If the request asks for priorities, relative preferences, planner tuning, or trade-offs, reply {"intent":"unsupported_intent"}.',
  '- If the request is about neither supported activity, reply {"intent":"unsupported_intent"}.',
  '- For watchTv, choose "focalPointId" ONLY from the IDs listed in the context. Never invent an ID.',
  '- If several TV focal points are listed and the TV request does not clearly identify one, reply {"intent":"ambiguous_focal"}.',
  '- Reply with a single JSON object and nothing else. Do not explain your reasoning.',
  '- Never output coordinates, geometry, distances, numeric weights or any other planner parameters.',
].join('\n');

/**
 * Tiny JSON-Schema-shaped description of the allowed output, built from the
 * IDs explicitly supplied in the IntentContext. Track B owns this schema;
 * parsePlanningGoalV2() remains the final structural authority regardless of
 * what any provider-side schema enforcement does. No schema library involved.
 */
export const buildPlanningIntentOutputSchema = (allowedFocalIds: readonly PlanningEntityId[]) => {
  const branches = [
    ...(allowedFocalIds.length === 0
      ? []
      : [{
        type: 'object',
        additionalProperties: false,
        required: ['activity', 'focalPointId'],
        properties: {
          activity: { type: 'string', enum: ['watchTv'] },
          focalPointId: { type: 'string', enum: [...allowedFocalIds] },
        },
      }]),
    {
      type: 'object',
      additionalProperties: false,
      required: ['activity'],
      properties: {
        activity: { type: 'string', enum: ['conversation'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['intent'],
      properties: {
        intent: { type: 'string', enum: ['unsupported_intent'] },
      },
    },
    ...(allowedFocalIds.length <= 1
      ? []
      : [{
        type: 'object',
        additionalProperties: false,
        required: ['intent'],
        properties: {
          intent: { type: 'string', enum: ['ambiguous_focal'] },
        },
      }]),
  ];

  return {
    name: 'planning_goal_v2',
    strict: true,
    schema: {
      type: 'object',
      oneOf: branches,
    },
  };
};
