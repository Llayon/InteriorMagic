import { describe, expect, it } from 'vitest';
import { isPlacementValid } from '@/editor/placement/placement';
import { createBeautifulRoomProject } from './beautifulRoom';

describe('beautiful room visual fixture', () => {
  it('uses only valid floor placements without changing the project schema', () => {
    const project = createBeautifulRoomProject();
    expect(project.version).toBe(1);
    expect(project.objects).toHaveLength(9);
    for (const object of project.objects) expect(isPlacementValid(project, object), object.instanceId).toBe(true);
  });
});
