import type { PlanningPriorityV1 } from '../contracts/types';
import type { LayoutSelectionPolicy } from '@/editor/planning/livingRoom';

/**
 * Frozen G1 TV heuristics. These values preserve the characterized planner
 * behavior; they are not general interior-design standards.
 */
export const TV_DEFAULT_PRIORITIES: PlanningPriorityV1[] = ['viewing', 'circulation', 'conversation'];

export const TV_LAYOUT_HEURISTICS = {
  prioritySlots: [45, 30, 15] as const,
  rearBoundaryRuleWeight: 10,
  sofa: {
    wallClearance: .1,
    wallAlongFactors: [-.6, 0, .6] as const,
  },
  armchair: {
    slots: [[-1.35, .65], [1.35, .65], [-1.55, 1.35], [1.55, 1.35], [-1.25, 2], [1.25, 2]] as const,
  },
  coffeeTable: {
    gaps: [.35, .5, .65] as const,
    lateralOffsets: [-.25, 0, .25] as const,
  },
  viewing: {
    idealDistance: 2.5,
    orientationWeight: .75,
    distanceWeight: .25,
  },
  conversation: {
    idealDistance: 1.8,
    facingWeight: .55,
    distanceWeight: .45,
  },
  rearBoundary: {
    referenceGap: .5,
  },
} as const;

/**
 * The movement formula is the legacy TV selection policy. The engine only
 * receives these measured metrics and remains unaware of TV semantics.
 */
export const TV_SELECTION_POLICY: LayoutSelectionPolicy = {
  acceptanceThreshold: 4,
  movementCost: ({ movedCount, translation, rotation }) =>
    Math.min(20, movedCount * 2 + translation * 2 + rotation / (Math.PI / 4)),
};
