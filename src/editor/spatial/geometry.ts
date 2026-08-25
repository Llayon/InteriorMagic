import type { Vec2 } from '@/editor/model/types';

export type RectBounds = {
  width: number;
  depth: number;
};

export type OrientedRect = RectBounds & {
  center: Vec2;
  rotationY: number;
};

const SAT_PENETRATION_TOLERANCE = 0.005;
const CONTAINMENT_EPSILON = 1e-6;

export const rotatedHalfExtents = ({ width, depth }: RectBounds, rotationY: number): Vec2 => ({
  x: Math.abs(Math.cos(rotationY)) * width / 2 + Math.abs(Math.sin(rotationY)) * depth / 2,
  z: Math.abs(Math.sin(rotationY)) * width / 2 + Math.abs(Math.cos(rotationY)) * depth / 2,
});

export const orientedCorners = ({ center, width, depth, rotationY }: OrientedRect): Vec2[] => {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ].map(({ x, z }) => ({
    x: center.x + x * cosine - z * sine,
    z: center.z + x * sine + z * cosine,
  }));
};

const axes = (points: readonly Vec2[]): Vec2[] => points.slice(0, 2).map((point, index) => {
  const next = points[(index + 1) % points.length]!;
  const dx = next.x - point.x;
  const dz = next.z - point.z;
  const length = Math.hypot(dx, dz);
  return { x: -dz / length, z: dx / length };
});

export const orientedRectsOverlap = (a: OrientedRect, b: OrientedRect): boolean => {
  const aCorners = orientedCorners(a);
  const bCorners = orientedCorners(b);
  return [...axes(aCorners), ...axes(bCorners)].every((axis) => {
    const aProjection = aCorners.map((point) => point.x * axis.x + point.z * axis.z);
    const bProjection = bCorners.map((point) => point.x * axis.x + point.z * axis.z);
    return Math.max(...aProjection) > Math.min(...bProjection) + SAT_PENETRATION_TOLERANCE
      && Math.max(...bProjection) > Math.min(...aProjection) + SAT_PENETRATION_TOLERANCE;
  });
};

export const rectContainedInRoom = (room: RectBounds, rect: OrientedRect): boolean => {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;
  return orientedCorners(rect).every((point) =>
    point.x >= -halfWidth - CONTAINMENT_EPSILON
    && point.x <= halfWidth + CONTAINMENT_EPSILON
    && point.z >= -halfDepth - CONTAINMENT_EPSILON
    && point.z <= halfDepth + CONTAINMENT_EPSILON);
};

export const pointDistance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.z - a.z);

export const xzHeading = (from: Vec2, to: Vec2): number => Math.atan2(to.x - from.x, to.z - from.z);

export const angularDifference = (a: number, b: number): number => {
  const fullTurn = Math.PI * 2;
  const difference = ((a - b + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  return Math.abs(difference);
};

/** Deterministic axis-aligned occupancy approximation for a set of floor rects. */
export const floorOpenArea = (room: RectBounds, rects: readonly OrientedRect[]): number => {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;
  const boxes = rects.map((rect) => {
    const half = rotatedHalfExtents(rect, rect.rotationY);
    return {
      left: Math.max(-halfWidth, rect.center.x - half.x),
      right: Math.min(halfWidth, rect.center.x + half.x),
      top: Math.max(-halfDepth, rect.center.z - half.z),
      bottom: Math.min(halfDepth, rect.center.z + half.z),
    };
  }).filter((box) => box.right > box.left && box.bottom > box.top);
  const xEvents = [...new Set(boxes.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b);
  let occupied = 0;
  for (let index = 0; index < xEvents.length - 1; index += 1) {
    const left = xEvents[index]!;
    const right = xEvents[index + 1]!;
    if (right <= left) continue;
    const intervals = boxes.filter((box) => box.left < right && box.right > left)
      .map((box) => [box.top, box.bottom] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let start = intervals[0]?.[0] ?? 0;
    let end = intervals[0]?.[1] ?? 0;
    for (const [from, to] of intervals.slice(1)) {
      if (from > end) { covered += end - start; start = from; }
      end = Math.max(end, to);
    }
    if (intervals.length > 0) covered += end - start;
    occupied += (right - left) * covered;
  }
  return Math.max(0, room.width * room.depth - occupied);
};

/** Centroid of object centers, returning the origin for an empty group. */
export const clusterCentroid = (rects: readonly OrientedRect[]): Vec2 => {
  if (rects.length === 0) return { x: 0, z: 0 };
  return rects.reduce((sum, rect) => ({
    x: sum.x + rect.center.x / rects.length,
    z: sum.z + rect.center.z / rects.length,
  }), { x: 0, z: 0 });
};

/** How strongly a group hugs the room edges (1 = on an edge, 0 = centered). */
export const edgeBias = (room: RectBounds, rects: readonly OrientedRect[]): number => {
  if (rects.length === 0) return 0;
  const radius = Math.max(Math.min(room.width, room.depth) / 2, 1e-9);
  const average = rects.reduce((sum, rect) => {
    const half = rotatedHalfExtents(rect, rect.rotationY);
    const wallGap = Math.min(room.width / 2 - Math.abs(rect.center.x) - half.x,
      room.depth / 2 - Math.abs(rect.center.z) - half.z);
    return sum + Math.max(0, wallGap) / radius;
  }, 0) / rects.length;
  return Math.max(0, Math.min(1, 1 - average));
};

/** Conservative free-floor corridor estimate used by open-space hard rules. */
export const pathWidth = (room: RectBounds, rects: readonly OrientedRect[]): number => {
  if (rects.length < 2) return Math.min(room.width, room.depth);
  let minimum = Math.min(room.width, room.depth);
  for (let first = 0; first < rects.length; first += 1) {
    const a = rects[first]!;
    const ah = rotatedHalfExtents(a, a.rotationY);
    for (let second = first + 1; second < rects.length; second += 1) {
      const b = rects[second]!;
      const bh = rotatedHalfExtents(b, b.rotationY);
      const gapX = Math.max(0, Math.abs(a.center.x - b.center.x) - ah.x - bh.x);
      const gapZ = Math.max(0, Math.abs(a.center.z - b.center.z) - ah.z - bh.z);
      const gap = Math.hypot(gapX, gapZ);
      minimum = Math.min(minimum, gap);
    }
  }
  return minimum;
};
