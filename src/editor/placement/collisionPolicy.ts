export type CollisionProfile = { group: number; mask: number };

export const collisionMasksOverlap = (a: CollisionProfile, b: CollisionProfile): boolean =>
  (a.mask & b.group) !== 0 && (b.mask & a.group) !== 0;
