import { describe, expect, it } from 'vitest';
import { isAr0Enabled } from './releaseGate';

describe('AR0 release gate', () => {
  it.each([undefined, '', 'false', 'TRUE', '1', ' true '])('is default-off for %s', (value) => {
    expect(isAr0Enabled(value)).toBe(false);
  });

  it('enables AR0 only for the literal true', () => {
    expect(isAr0Enabled('true')).toBe(true);
  });
});
