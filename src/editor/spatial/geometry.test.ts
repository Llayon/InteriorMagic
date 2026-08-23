import { describe, expect, it } from 'vitest';
import { orientedCorners, orientedRectsOverlap, rectContainedInRoom, rotatedHalfExtents, type OrientedRect } from './geometry';

const rect = (x: number, z: number, width = 2, depth = 1, rotationY = 0): OrientedRect =>
  ({ center: { x, z }, width, depth, rotationY });

describe('spatial rectangle geometry', () => {
  it('computes rotated half-extents and oriented corners', () => {
    const extent = rotatedHalfExtents({ width: 2, depth: 1 }, Math.PI / 2);
    expect(extent.x).toBeCloseTo(.5);
    expect(extent.z).toBeCloseTo(1);
    expect(orientedCorners(rect(1, 2, 2, 1, Math.PI / 2))[0]).toEqual(expect.objectContaining({ x: 1.5, z: 1 }));
  });

  it('uses SAT for separated, overlapping, and rotated rectangles', () => {
    expect(orientedRectsOverlap(rect(0, 0), rect(3, 0))).toBe(false);
    expect(orientedRectsOverlap(rect(0, 0), rect(1, 0))).toBe(true);
    expect(orientedRectsOverlap(rect(0, 0), rect(1.1, .2, 1, 1, Math.PI / 4))).toBe(true);
  });

  it('does not treat contact or penetration up to 5 mm as overlap', () => {
    expect(orientedRectsOverlap(rect(0, 0), rect(2, 0))).toBe(false);
    expect(orientedRectsOverlap(rect(0, 0), rect(1.995, 0))).toBe(false);
    expect(orientedRectsOverlap(rect(0, 0), rect(1.994, 0))).toBe(true);
  });

  it('allows the one-micrometre room containment epsilon', () => {
    const room = { width: 4, depth: 4 };
    expect(rectContainedInRoom(room, rect(1.000001, 0))).toBe(true);
    expect(rectContainedInRoom(room, rect(1.000002, 0))).toBe(false);
    expect(rectContainedInRoom(room, rect(0, 0, 2, 1, Math.PI / 4))).toBe(true);
  });
});
