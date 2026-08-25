import { describe, expect, it } from 'vitest';
import { edgeBias, floorOpenArea, pathWidth } from './geometry';

describe('open-space geometry facts', () => {
  const room = { width: 10, depth: 10 };
  it('computes occupied and open floor area deterministically', () => {
    const full = floorOpenArea(room, [{ center: { x: 0, z: 0 }, width: 10, depth: 10, rotationY: 0 }]);
    const half = floorOpenArea(room, [{ center: { x: 0, z: 0 }, width: 5, depth: 10, rotationY: 0 }]);
    expect(full).toBeCloseTo(0);
    expect(half).toBeCloseTo(50);
  });
  it('rewards edge placement and measures pairwise corridor width', () => {
    const edge = [{ center: { x: 4, z: 0 }, width: 1, depth: 1, rotationY: 0 }];
    const center = [{ center: { x: 0, z: 0 }, width: 1, depth: 1, rotationY: 0 }];
    expect(edgeBias(room, edge)).toBeGreaterThan(edgeBias(room, center));
    expect(pathWidth(room, [
      { center: { x: -1, z: 0 }, width: 1, depth: 1, rotationY: 0 },
      { center: { x: 1, z: 0 }, width: 1, depth: 1, rotationY: 0 },
    ])).toBeCloseTo(1);
  });
});
