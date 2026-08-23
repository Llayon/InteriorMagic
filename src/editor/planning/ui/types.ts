/**
 * Planner fixture type — opaque to the generic UI store.
 *
 * Known only by the dev/test harness. A real planner (Integration 1) does
 * not pass any fixture id; this type stays harness-local so the UI store
 * remains orchestrator-agnostic.
 */
export type PlannerFixtureId = 'improved' | 'noop' | 'error';
