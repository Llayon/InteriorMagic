import { describe, expect, it } from 'vitest';
import { getAsset } from '@/editor/assets/registry';
import { createDefaultProject } from '@/editor/model/types';
import { getRotatedHalfExtents } from './collision';
import { resolveSnap, snapToGrid, WALL_RELEASE_THRESHOLD, WALL_SNAP_THRESHOLD } from './snap';

describe('SnapResolver', () => {
  const project = createDefaultProject();
  const sofa = getAsset('sofa');

  it('snaps to the 5 cm grid', () => expect(snapToGrid(.123)).toBeCloseTo(.1));

  it('engages, holds and releases a named wall target', () => {
    const half = sofa.footprint.width / 2;
    const wallValue = -project.room.width / 2 + half;
    const engaged = resolveSnap({ x: wallValue + WALL_SNAP_THRESHOLD, z: .13 }, project, sofa, 0);
    expect(engaged.state.x?.targetId).toBe('wall:left');
    expect(engaged.position.x).toBeCloseTo(wallValue);
    const held = resolveSnap({ x: wallValue + .07, z: .13 }, project, sofa, 0, engaged.state);
    expect(held.state.x?.targetId).toBe('wall:left');
    const released = resolveSnap({ x: wallValue + WALL_RELEASE_THRESHOLD + .011, z: .13 }, project, sofa, 0, held.state);
    expect(released.state.x?.type).toBe('grid');
  });

  it('uses rotated extents near a wall', () => {
    const rotation = Math.PI / 4;
    const extent = getRotatedHalfExtents(sofa.footprint.width, sofa.footprint.depth, rotation);
    const wallValue = -project.room.width / 2 + extent.x;
    const result = resolveSnap({ x: wallValue + .04, z: 0 }, project, sofa, rotation);
    expect(result.state.x?.targetId).toBe('wall:left');
    expect(result.position.x).toBeCloseTo(wallValue);
  });

  it('does not create a wall target after clamping a far-outside raw point', () => {
    const result = resolveSnap({ x: -5, z: 0 }, project, sofa, 0);
    expect(result.state.x?.type).toBe('grid');
    expect(result.position.x).toBeCloseTo(-project.room.width / 2 + sofa.footprint.width / 2);
  });
});
