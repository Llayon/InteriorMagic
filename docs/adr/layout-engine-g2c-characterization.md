# Layout Engine G2C — Characterization and Budget Safety

## Status

G2C is a safety-freeze track. It does not add a new planning mode.

## Scope

- The shared exhaustive search is fail-closed when `stoppedByBudget` is true.
- An incomplete search returns `selection.outcome = 'search-incomplete'`,
  keeps `scoreAfter === scoreBefore`, emits no moves, and therefore cannot be
  applied by Preview/Apply.
- The budget result is deterministic across repeated runs.
- Representative TV and Conversation proposals are frozen in their existing
  planner test suites. Existing TV characterization remains byte-identical;
  Conversation now has an exact representative proposal freeze.

## Boundaries

Contract v1, RoomProject, UI routing, and planner scenario semantics are
unchanged. No open-space, circulation, navigation, or new geometry rule is
introduced here. A future scenario must first complete its own architecture
review after this safety freeze.
