# Layout Engine V1 — Living Room

## Status

Accepted for Track G G1C hardening.

## Decision

The living-room planner uses a small scenario-neutral engine in
`src/editor/planning/livingRoom/engine.ts`. An `ActiveGroup` explicitly
separates movable entities from fixed context. Relationship-owned candidate
dimensions and rule evaluators are supplied by the scenario caller.

The engine performs exhaustive deterministic search with partial hard-
constraint pruning, movement-cost selection, and deterministic lexical
tie-breaking. The optional `LayoutSearchLimits` cap valid arrangement
evaluations; when reached, `LayoutDiagnostics.stoppedByBudget` records the
bounded stop. `scene.entities` iteration order is intentionally retained in
the selection key to preserve the legacy TV deterministic tie-break.

Invalid scene, active-group, current-layout, and search-limit failures cross
the boundary as typed `PlanningError` values. A no-valid-plan result remains a
normal no-op `PlanProposal` outcome, not an exception.

`PlanningScene` and its spatial entity types live in
`src/editor/planning/livingRoom/PlanningScene.ts`; its `PlanningRole` is an
opaque generic role boundary. Lexical ordering uses explicit code-point
comparison rather than locale-sensitive comparison. The TV module remains a
compatibility facade: TV focal resolution, candidate formulas, viewing and
rear-boundary rules, priorities, findings, and Contract v1 interpretation stay
in `planning/tv/`.

The engine searches only the supplied active movable group. Fixed context is
validated as collision context and is never a candidate dimension. The editor
continues to own proposal validation, Preview, atomic Apply, and Undo/Redo
history. Contract v1 and `RoomProject` are unchanged.

## Consequences

TV planning keeps its public `planTvViewing()` behavior while sharing the
layout machinery. Conversation, Auto, and Free Space remain deferred; no
scenario registry, plugin system, or alternative search strategy is part of
this decision.
