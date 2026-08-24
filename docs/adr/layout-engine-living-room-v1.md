# Layout Engine V1 — Living Room

## Status

Accepted for Track G G1B extraction.

## Decision

The living-room planner uses a small scenario-neutral engine in
`src/editor/planning/livingRoom/engine.ts`. The engine owns active-group
validation, bounded candidate enumeration, physical hard constraints,
deterministic quality aggregation, movement cost, selection, and
`PlanProposal` assembly. Candidate providers and rule evaluators remain
scenario policy supplied by the caller.

`PlanningScene` and its spatial entity types live in
`src/editor/planning/livingRoom/PlanningScene.ts`. The TV module remains a
compatibility facade: TV focal resolution, candidate formulas, viewing and
rear-boundary rules, priorities, findings, and Contract v1 interpretation stay
in `planning/tv/`.

The engine searches only the supplied active movable group. Fixed context is
validated as collision context and is never a candidate dimension. The editor
continues to own proposal validation and atomic application; Contract v1 and
`RoomProject` are unchanged.

## Consequences

TV planning keeps its public `planTvViewing()` behavior while sharing the
layout machinery. New scenarios may supply their own candidate providers and
rule evaluators without adding scenario knowledge to the engine.
