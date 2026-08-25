import type { LayoutSelectionPolicy } from '@/editor/planning/livingRoom';

/** Conversation v1 heuristics; these are scenario policy, not engine defaults. */
export const CONVERSATION_LAYOUT_HEURISTICS = {
  weights: {
    facing: 55,
    distance: 35,
    rearBoundary: 10,
  },
  sofa: {
    wallClearance: .1,
    wallAlongFactors: [-.6, 0, .6] as const,
  },
  armchair: {
    slots: [[-1.35, .65], [1.35, .65], [-1.55, 1.35], [1.55, 1.35]] as const,
  },
  distance: {
    ideal: 1.8,
  },
  rearBoundary: {
    referenceGap: .5,
  },
} as const;

/** Conversation owns its acceptance and movement policy; the engine only measures movement. */
export const CONVERSATION_SELECTION_POLICY: LayoutSelectionPolicy = {
  acceptanceThreshold: 4,
  movementCost: ({ movedCount, translation, rotation }) =>
    Math.min(20, movedCount * 2 + translation * 2 + rotation / (Math.PI / 4)),
};
