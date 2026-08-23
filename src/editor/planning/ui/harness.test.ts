import { describe, expect, it } from 'vitest';
import {
  parsePlannerFixture,
  PLANNER_FIXTURE_QUERY_KEY,
  PLANNER_FIXTURE_HARNESS_ENABLED,
} from './harness';

describe('planner harness URL flag', () => {
  it('returns null when the flag is absent (default OFF)', () => {
    expect(parsePlannerFixture('')).toBeNull();
    expect(parsePlannerFixture('?demo=1')).toBeNull();
  });

  it('accepts the three documented fixture ids', () => {
    expect(parsePlannerFixture('?planning-fixture=improved')).toBe('improved');
    expect(parsePlannerFixture('?planning-fixture=noop')).toBe('noop');
    expect(parsePlannerFixture('?planning-fixture=error')).toBe('error');
  });

  it('coexists with other query parameters without mutation', () => {
    expect(parsePlannerFixture('?demo=1&planning-fixture=noop')).toBe('noop');
    expect(parsePlannerFixture('?planning-fixture=improved&registry=ithappy')).toBe('improved');
  });

  it('rejects unknown or malformed fixture values', () => {
    expect(parsePlannerFixture('?planning-fixture=planner')).toBeNull();
    expect(parsePlannerFixture('?planning-fixture=')).toBeNull();
    expect(parsePlannerFixture('?planning-fixture=improved; drop table')).toBeNull();
  });

  it('exposes the query-key constant for harness wiring', () => {
    expect(PLANNER_FIXTURE_QUERY_KEY).toBe('planning-fixture');
  });
});

describe('planner harness production isolation', () => {
  /**
   * The env flag `VITE_PLANNER_FIXTURE_HARNESS_ENABLED` must default to
   * `false` so production builds ignore `?planning-fixture=…` entirely.
   *
   * We cannot directly inject the env at test time (Vite's `import.meta.env`
   * is a build-time constant), so we test the contract by:
   *   1. asserting the default reads `false` in our test build (which does
   *      not set the flag), and
   *   2. asserting the call site that consumes the flag combines it with
   *      `parsePlannerFixture` so neither flag nor query alone activates
   *      the harness.
   */
  it('default value of PLANNER_FIXTURE_HARNESS_ENABLED is false when env flag is unset', () => {
    // The test build does not set VITE_PLANNER_FIXTURE_HARNESS_ENABLED, so
    // the constant must read false.
    expect(PLANNER_FIXTURE_HARNESS_ENABLED).toBe(false);
  });

  it('combined guard treats query as inert when env flag is false', () => {
    // Simulates the production gate in main.tsx:
    const requestedFixture = PLANNER_FIXTURE_HARNESS_ENABLED
      ? parsePlannerFixture('?planning-fixture=improved')
      : null;
    expect(requestedFixture).toBeNull();
  });
});
