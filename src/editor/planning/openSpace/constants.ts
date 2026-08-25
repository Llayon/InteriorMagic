import type { LayoutSelectionPolicy } from '@/editor/planning/livingRoom';

/** Open-space heuristics are scenario policy; the shared engine owns no weights. */
export const OPEN_SPACE_LAYOUT_HEURISTICS = {
  weights: { largestRegion: 45, openArea: 30, cohesion: 15, edgeBias: 10 },
  minPathWidth: .6,
  wallClearance: .1,
  wallAlongFactors: [-.7, .7] as const,
  sofaWallAlongFactors: [-.6, 0, .6] as const,
  seating: {
    armchairSlots: [[-1.35, .65], [1.35, .65]] as const,
    tableSlots: [[0, .75], [0, 1.25], [-.8, .95], [.8, .95]] as const,
  },
} as const;

export const OPEN_SPACE_SELECTION_POLICY: LayoutSelectionPolicy = {
  acceptanceThreshold: .25,
  movementCost: ({ movedCount, translation, rotation }) =>
    Math.min(20, movedCount * .25 + translation * .15 + rotation / (Math.PI * 8)),
};
