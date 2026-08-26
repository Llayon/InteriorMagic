import type { PlanningGoalV1, PlanningGoalV2, PlanningPriorityV1 } from './types';

const planningPriorities: readonly PlanningPriorityV1[] = ['viewing', 'circulation', 'conversation'];
const planningPrioritySet = new Set<string>(planningPriorities);
const v1GoalFields = new Set(['activity', 'focalPointId', 'priorities']);
const watchTvV2Fields = new Set(['activity', 'focalPointId']);
const conversationV2Fields = new Set(['activity']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rejectUnknownField = (
  value: Record<string, unknown>, allowed: ReadonlySet<string>, contract: string,
): void => {
  const unknownField = Object.keys(value).find((field) => !allowed.has(field));
  if (unknownField) throw new Error(`Unknown ${contract} field: ${unknownField}`);
};

const parseFocalPointId = (value: unknown, contract: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${contract} focalPointId must be a non-empty string`);
  }
  return value;
};

export const parsePlanningGoalV1 = (value: unknown): PlanningGoalV1 => {
  if (!isRecord(value)) throw new Error('PlanningGoalV1 must be an object');
  rejectUnknownField(value, v1GoalFields, 'PlanningGoalV1');
  if (value.activity !== 'watchTv') throw new Error('Unsupported PlanningGoalV1 activity');
  const focalPointId = parseFocalPointId(value.focalPointId, 'PlanningGoalV1');

  if (value.priorities === undefined) return { activity: 'watchTv', focalPointId };
  if (!Array.isArray(value.priorities) || value.priorities.length === 0) {
    throw new Error('PlanningGoalV1 priorities must be a non-empty array when provided');
  }

  const priorities: PlanningPriorityV1[] = [];
  const seen = new Set<PlanningPriorityV1>();
  for (const [index, priority] of value.priorities.entries()) {
    if (typeof priority !== 'string' || !planningPrioritySet.has(priority)) {
      throw new Error(`Unknown PlanningGoalV1 priority at index ${index}`);
    }
    const typedPriority = priority as PlanningPriorityV1;
    if (seen.has(typedPriority)) throw new Error(`Duplicate PlanningGoalV1 priority: ${typedPriority}`);
    seen.add(typedPriority);
    priorities.push(typedPriority);
  }
  return { activity: 'watchTv', focalPointId, priorities };
};

export const parsePlanningGoalV2 = (value: unknown): PlanningGoalV2 => {
  if (!isRecord(value)) throw new Error('PlanningGoalV2 must be an object');
  if (value.activity === 'watchTv') {
    rejectUnknownField(value, watchTvV2Fields, 'PlanningGoalV2');
    return { activity: 'watchTv', focalPointId: parseFocalPointId(value.focalPointId, 'PlanningGoalV2') };
  }
  if (value.activity === 'conversation') {
    rejectUnknownField(value, conversationV2Fields, 'PlanningGoalV2');
    return { activity: 'conversation' };
  }
  throw new Error('Unsupported PlanningGoalV2 activity');
};
