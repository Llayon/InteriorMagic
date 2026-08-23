import { describe, expect, it } from 'vitest';
import { planningProjectFingerprint } from './projectFingerprint';
import { createIntegrationProject } from './testFixtures';

describe('planningProjectFingerprint', () => {
  it('is order-independent and ignores finishes and variants', () => {
    const project = createIntegrationProject();
    const changed = structuredClone(project);
    changed.objects.reverse();
    changed.finishes.floorMaterialId = 'walnut';
    changed.objects[0]!.variantId = 'other';
    expect(planningProjectFingerprint(changed)).toBe(planningProjectFingerprint(project));
  });

  it('changes for room geometry, identity, asset, position, or rotation', () => {
    const project = createIntegrationProject();
    for (const mutate of [
      (copy: typeof project) => { copy.room.width += 1; },
      (copy: typeof project) => { copy.objects[0]!.instanceId += '-changed'; },
      (copy: typeof project) => { copy.objects[0]!.assetId = 'other'; },
      (copy: typeof project) => { copy.objects[0]!.position.y += .1; },
      (copy: typeof project) => { copy.objects[0]!.rotationY += .1; },
    ]) {
      const copy = structuredClone(project); mutate(copy);
      expect(planningProjectFingerprint(copy)).not.toBe(planningProjectFingerprint(project));
    }
  });
});
