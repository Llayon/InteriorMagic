import type { PlanningGoal, PlanningPriority } from './types';

const planningPriorities: readonly PlanningPriority[] = ['viewing', 'circulation', 'conversation'];
const planningPrioritySet = new Set<string>(planningPriorities);
const goalFields = new Set(['activity', 'focalPointId', 'priorities']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parsePlanningGoal = (value: unknown): PlanningGoal => {
  if (!isRecord(value)) throw new Error('PlanningGoal must be an object');

  const unknownField = Object.keys(value).find((field) => !goalFields.has(field));
  if (unknownField) throw new Error(`Unknown PlanningGoal field: ${unknownField}`);
  if (value.activity !== 'watchTv') throw new Error('Unsupported PlanningGoal activity');
  if (typeof value.focalPointId !== 'string' || value.focalPointId.trim().length === 0) {
    throw new Error('PlanningGoal focalPointId must be a non-empty string');
  }

  if (value.priorities === undefined) {
    return { activity: 'watchTv', focalPointId: value.focalPointId };
  }
  if (!Array.isArray(value.priorities) || value.priorities.length === 0) {
    throw new Error('PlanningGoal priorities must be a non-empty array when provided');
  }

  const priorities: PlanningPriority[] = [];
  const seen = new Set<PlanningPriority>();
  for (const [index, priority] of value.priorities.entries()) {
    if (typeof priority !== 'string' || !planningPrioritySet.has(priority)) {
      throw new Error(`Unknown PlanningGoal priority at index ${index}`);
    }
    const typedPriority = priority as PlanningPriority;
    if (seen.has(typedPriority)) throw new Error(`Duplicate PlanningGoal priority: ${typedPriority}`);
    seen.add(typedPriority);
    priorities.push(typedPriority);
  }

  return { activity: 'watchTv', focalPointId: value.focalPointId, priorities };
};
