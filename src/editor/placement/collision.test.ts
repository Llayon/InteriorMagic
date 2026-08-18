import { describe, expect, it } from 'vitest';
import { CollisionGroup, createDefaultProject, type FurnitureInstance } from '@/editor/model/types';
import { collisionMasksOverlap, getObbCorners, isInsideRoom, isPlacementValid, orientedRectsIntersect } from './collision';

const object = (instanceId: string, assetId: string, x: number, z: number, rotationY = 0): FurnitureInstance => ({ instanceId, assetId, position: { x, y: 0, z }, rotationY });

describe('OBB collision', () => {
  it('detects separated, overlapping and rotated rectangles', () => {
    const sofa = object('sofa', 'sofa', 0, 0);
    expect(orientedRectsIntersect(getObbCorners(sofa), getObbCorners(object('table', 'table', 3, 0)))).toBe(false);
    expect(orientedRectsIntersect(getObbCorners(sofa), getObbCorners(object('table', 'table', .4, 0)))).toBe(true);
    expect(orientedRectsIntersect(getObbCorners(sofa), getObbCorners(object('table', 'table', 1.1, .2, Math.PI / 4)))).toBe(true);
  });

  it('validates room bounds with rotated footprints', () => {
    const project = createDefaultProject();
    expect(isInsideRoom(project, object('sofa', 'sofa', 0, 0, Math.PI / 4))).toBe(true);
    expect(isInsideRoom(project, object('sofa', 'sofa', 1.5, 0, Math.PI / 4))).toBe(false);
  });
});

describe('collision masks', () => {
  it('requires symmetric permission, including asymmetric masks', () => {
    const furniture = { group: CollisionGroup.FURNITURE, mask: CollisionGroup.RUG };
    const rugRejects = { group: CollisionGroup.RUG, mask: 0 };
    expect(collisionMasksOverlap(furniture, rugRejects)).toBe(false);
    expect(collisionMasksOverlap(rugRejects, furniture)).toBe(false);
    expect(collisionMasksOverlap(
      { group: CollisionGroup.FURNITURE, mask: CollisionGroup.DECOR },
      { group: CollisionGroup.DECOR, mask: CollisionGroup.FURNITURE },
    )).toBe(true);
  });

  it('allows a sofa on a rug but rejects a table on a sofa', () => {
    const project = createDefaultProject();
    project.objects = [object('rug', 'rug', 0, 0), object('sofa', 'sofa', 0, 0)];
    expect(isPlacementValid(project, project.objects[1]!)).toBe(true);
    expect(isPlacementValid(project, object('table', 'table', 0, 0))).toBe(false);
  });
});
