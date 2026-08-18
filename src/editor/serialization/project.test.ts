import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/editor/model/types';
import { deserializeProject, serializeProject } from './project';

describe('project serialization', () => {
  it('round trips a version 1 project without session history', () => {
    const project = createDefaultProject(); project.objects.push({ instanceId: 'a', assetId: 'rug', position: { x: 0, y: 0, z: 0 }, rotationY: 0 });
    expect(deserializeProject(serializeProject(project))).toEqual(project);
    expect(serializeProject(project)).not.toContain('undoStack');
  });
  it('rejects unsupported versions', () => expect(() => deserializeProject('{"version":2}')).toThrow('Unsupported'));
});
