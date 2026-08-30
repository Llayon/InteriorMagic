import type { FurnitureInstance, RoomProject } from '@/editor/model/types';

export const M1A_SEED_ALLOWED_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export const M1A_SHOWCASE_SEED_ID = 'intentional-chair-nudge' as const;

type SeedKey = 'rug' | 'sofa' | 'chairLeft' | 'chairRight' | 'table' | 'console' | 'lamp' | 'tv';
type SeedTransform = { x: number; y: number; z: number; rotationDegrees: number };
type SeedTemplateEntry = SeedTransform & Pick<FurnitureInstance, 'instanceId' | 'assetId'>;
type SeedOverrides = Partial<Record<SeedKey, Partial<SeedTransform>>>;

export interface M1ASeedVariation {
  id: string;
  /** Bounded editorial adjustments applied to the human-designed template. */
  overrides: SeedOverrides;
}

/**
 * Human-designed media/conversation room, before planner considerations:
 * - sofa faces the TV and its console;
 * - chairs form the two sides of the seating group;
 * - the coffee table and rug anchor that group;
 * - console and TV share the front wall;
 * - floor lamp supports the rear-right seating corner.
 */
export const M1A_HUMAN_DESIGNED_TEMPLATE: Record<SeedKey, SeedTemplateEntry> = {
  rug: { instanceId: 'showcase-rug', assetId: 'carpet', x: 0, y: 0, z: -0.45, rotationDegrees: 0 },
  sofa: { instanceId: 'showcase-sofa', assetId: 'sofa_030', x: 0, y: 0, z: -1.70, rotationDegrees: 0 },
  chairLeft: { instanceId: 'showcase-chair-left', assetId: 'chair', x: -2.05, y: 0, z: 0.10, rotationDegrees: 135 },
  chairRight: { instanceId: 'showcase-chair-right', assetId: 'chair', x: 2.05, y: 0, z: 0.10, rotationDegrees: 225 },
  table: { instanceId: 'showcase-table', assetId: 'coffee_table_026', x: 0, y: 0, z: 0.05, rotationDegrees: 0 },
  console: { instanceId: 'showcase-console', assetId: 'dresser_001', x: 0, y: 0, z: 2.50, rotationDegrees: 180 },
  lamp: { instanceId: 'showcase-lamp', assetId: 'lamp', x: 2.65, y: 0, z: -1.65, rotationDegrees: 0 },
  tv: { instanceId: 'showcase-tv', assetId: 'electronics', x: 0, y: 1.15, z: 2.84, rotationDegrees: 180 },
};

/** Explicit, bounded editorial variants. There is no random or unrestricted search. */
export const M1A_CURATED_SEED_VARIATIONS: readonly M1ASeedVariation[] = [
  { id: 'balanced-diagonal', overrides: {} },
  {
    id: 'cardinal-conversation',
    overrides: {
      chairLeft: { rotationDegrees: 90 },
      chairRight: { rotationDegrees: 270 },
    },
  },
  {
    id: 'sofa-east-offset',
    overrides: {
      sofa: { x: 0.30 },
      table: { x: 0.10 },
    },
  },
  /** One chair is deliberately one 45-degree step open; the room remains plausible before planning. */
  {
    id: 'intentional-chair-nudge',
    overrides: {
      sofa: { x: 0.30 },
      chairRight: { x: 1.90, z: -0.20, rotationDegrees: 180 },
      table: { x: 0.10, z: 0.15 },
    },
  },
];

const seedOrder: readonly SeedKey[] = ['rug', 'sofa', 'chairLeft', 'chairRight', 'table', 'console', 'lamp', 'tv'];
const radians = (degrees: number) => degrees * Math.PI / 180;

export const createM1AShowcaseProjectForVariation = (variationId: string): RoomProject => {
  const variation = M1A_CURATED_SEED_VARIATIONS.find((candidate) => candidate.id === variationId);
  if (!variation) throw new Error(`Unknown M1A seed variation: ${variationId}`);
  const objects = seedOrder.map((key): FurnitureInstance => {
    const source = M1A_HUMAN_DESIGNED_TEMPLATE[key];
    const transform = { ...source, ...variation.overrides[key] };
    return {
      instanceId: source.instanceId,
      assetId: source.assetId,
      position: { x: transform.x, y: transform.y, z: transform.z },
      rotationY: radians(transform.rotationDegrees),
    };
  });
  return {
    version: 1,
    room: { width: 6.2, depth: 5.8, height: 2.7 },
    finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
    objects,
  };
};
