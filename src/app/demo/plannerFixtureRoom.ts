import type { FurnitureInstance, RoomProject } from '@/editor/model/types';

/**
 * Planner-fixture demo room.
 *
 * Instance IDs match the canonical Contract v1 fixtures (`sofa-main`,
 * `armchair-left`, `tv-1`) so the preview can exercise the proposed moves
 * against real editor objects.
 *
 * Room dimensions are intentionally large enough (6 × 8 m with the origin at
 * the centre → x ∈ [-3, 3], z ∈ [-4, 4]) for the canonical Contract v1
 * proposal to be both visually meaningful and geometrically valid:
 *   - sofa-main moves to (1.25, 3.4) with footprint 2.02 × 0.74 → contained
 *   - armchair-left moves to (0.65, 2.25) with footprint 0.61 × 0.84 → contained
 * The starting arrangement also fits inside the floor.
 *
 * Loaded ONLY when the planner harness flag is enabled AND the URL query
 * activates a fixture. Never part of the default starter room.
 */
const item = (instanceId: string, assetId: string, x: number, z: number, rotationY = 0): FurnitureInstance => ({
  instanceId, assetId, position: { x, y: 0, z }, rotationY,
});

export const createPlannerFixtureProject = (): RoomProject => ({
  version: 1,
  room: { width: 6, depth: 8, height: 2.7 },
  finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
  objects: [
    // TV stand against the back wall. `tv-1` is an opaque planning entity
    // ID — it is only treated as a focal point by the planner contract,
    // not moved by the canonical fixture's ProposedMoves.
    item('tv-1', 'lowBookcase', 0, -3.4, 0),
    // Initial arrangement: sofa rotated 90° away from TV, armchair blocking flow.
    item('sofa-main', 'nordicSofa', -1.6, -0.8, Math.PI / 2),
    item('armchair-left', 'relaxArmchair', 0.55, 0.6, 1.5),
    item('rug-main', 'roundedRug', 0, -0.6),
    item('lamp-main', 'roundFloorLamp', 1.4, -1.8),
    item('plant-main', 'tallPottedPlant', -1.55, 0.3),
  ],
});
