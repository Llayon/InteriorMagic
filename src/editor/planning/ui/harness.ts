import type { PlannerFixtureId } from './types';

/**
 * Resolve the planner harness fixture id from a URL search string.
 *
 * Default OFF: production traffic has no `?planning-fixture=…` and the planner
 * UX is not exposed at all. Only explicit `?planning-fixture=improved|noop|error`
 * enables the dev/test harness — and ONLY when `installPlannerHarness` has
 * been called (gated by `VITE_PLANNER_FIXTURE_HARNESS_ENABLED`).
 */
const ALLOWED: PlannerFixtureId[] = ['improved', 'noop', 'error'];

export const parsePlannerFixture = (search: string): PlannerFixtureId | null => {
  const params = new URLSearchParams(search);
  const raw = params.get('planning-fixture');
  if (!raw) return null;
  return (ALLOWED as string[]).includes(raw) ? (raw as PlannerFixtureId) : null;
};

export const PLANNER_FIXTURE_QUERY_KEY = 'planning-fixture';

/**
 * Build-time env flag for the dev/test harness. Mirrors the ithappy
 * remote-preview pattern: production builds ship with the flag absent,
 * so `?planning-fixture=…` is silently ignored — no fixture room, no
 * entry button, no RoomProject mutation.
 *
 * Vite only inlines env variables referenced via `import.meta.env.*` at
 * build/dev time. The reference below MUST stay textual and unbracketed
 * for Vite to detect and replace it. Do not indirect through a typed
 * helper or assign to a local variable.
 */
export const PLANNER_FIXTURE_HARNESS_ENABLED =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((import.meta as any).env?.VITE_PLANNER_FIXTURE_HARNESS_ENABLED === 'true' ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import.meta as any).env?.VITE_PLANNER_FIXTURE_HARNESS_ENABLED === '1');
