import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/editor/model/types';
import { deserializeProject, serializeProject } from './project';

describe('project serialization', () => {
  it('round trips a version 1 project without session history', () => {
    const project = createDefaultProject(); project.objects.push({ instanceId: 'a', assetId: 'rug', position: { x: 0, y: 0, z: 0 }, rotationY: 0 });
    expect(deserializeProject(serializeProject(project))).toEqual(project);
    expect(serializeProject(project)).not.toContain('undoStack');
  });
  it('rejects unsupported versions', () => expect(() => deserializeProject('{"version":2}')).toThrow());
  it('fail-closes malformed v1 documents that were previously tolerated', () => {
    // Shallow parser used to accept these: room truthy but non-numeric fields.
    const shallowValid = '{"version":1,"room":{},"finishes":{},"objects":"not-an-array"}';
    expect(() => deserializeProject(shallowValid)).toThrow();
    const negativeRoom = JSON.stringify({ version: 1, room: { width: -4, depth: 5, height: 2.7 }, finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' }, objects: [] });
    expect(() => deserializeProject(negativeRoom)).toThrow();
    const duplicateIds = JSON.stringify({
      version: 1,
      room: { width: 4, depth: 5, height: 2.7 },
      finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
      objects: [
        { instanceId: 'a', assetId: 'rug', position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
        { instanceId: 'a', assetId: 'sofa', position: { x: 1, y: 0, z: 0 }, rotationY: 0 },
      ],
    });
    expect(() => deserializeProject(duplicateIds)).toThrow();
    const unknownField = JSON.stringify({
      version: 1,
      ownerId: 'attacker',
      room: { width: 4, depth: 5, height: 2.7 },
      finishes: { floorMaterialId: 'oak', wallMaterialId: 'linen' },
      objects: [],
    });
    expect(() => deserializeProject(unknownField)).toThrow();
  });
});
