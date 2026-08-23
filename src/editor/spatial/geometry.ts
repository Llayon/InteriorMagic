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
