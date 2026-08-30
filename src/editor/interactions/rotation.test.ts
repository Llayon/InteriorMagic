import { describe, expect, it } from 'vitest';
import { normalizeRotation, nextSnapRotation, snapRotation } from './rotation';

const rad = (degrees: number) => degrees * Math.PI / 180;
describe('rotation contract', () => {
  it('normalizes negative and overflowing angles', () => { expect(normalizeRotation(-rad(45))).toBeCloseTo(rad(315)); expect(normalizeRotation(rad(725))).toBeCloseTo(rad(5)); });
  it('snaps to an absolute zero-anchored grid', () => { expect(snapRotation(rad(179.9), 45)).toBeCloseTo(rad(180)); expect(snapRotation(rad(89.999), 45)).toBeCloseTo(rad(90)); });
  it('advances past an angle already on the grid', () => { expect(nextSnapRotation(0, 45, -1)).toBeCloseTo(rad(315)); expect(nextSnapRotation(rad(90), 45, 1)).toBeCloseTo(rad(135)); expect(nextSnapRotation(rad(90), 45, -1)).toBeCloseTo(rad(45)); });
  it('supports arbitrary step and full-circle normalization', () => { expect(nextSnapRotation(rad(359), 30, 1)).toBeCloseTo(0); expect(snapRotation(rad(-16), 30)).toBeCloseTo(rad(330)); });
});
