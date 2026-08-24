# Layout Engine v1 Architecture Freeze

## Status

Accepted for the G1 completion boundary. This freeze is based on the
characterized G1 TV planner and the G1.5 hardening work.

## Frozen boundaries

### Living Room Engine

`src/editor/planning/livingRoom/engine.ts` owns mechanics only:

- ActiveGroup validation and fixed-context collision handling;
- candidate-dimension traversal and partial hard-constraint pruning;
- containment, opening-zone, collision, and placement validity checks;
- quality aggregation, movement measurement, deterministic exhaustive search;
- selection and `PlanProposal` assembly.

The engine does not know TV, Conversation, Feng Shui, AI, UI, or Contract
interpretation. It does not select a scenario or invent candidates.

### PlanningScene

`livingRoom/PlanningScene.ts` is the rectangular-room spatial boundary. It
contains room dimensions, spatial entities, transforms, footprints, collision
data, opaque planning roles, and explicit spatial zones. It contains no user
preferences, scenario modes, weights, or UI state.

The current integration projection remains the authoritative producer of this
scene for TV. The `livingRoom` directory is intentionally retained; a generic
directory move is deferred until a second scenario proves it necessary.

### Scenario adapter and policy

`planning/tv/` owns TV focal resolution, TV candidate providers, TV rule
evaluators, priorities, findings, and the TV selection-policy values.

Acceptance threshold and movement cost are supplied through the explicit
`LayoutSelectionPolicy` request field. They are not hidden in engine defaults.

### Errors and editor boundary

`PlanningError` is the single typed error boundary for scene projection,
scenario preconditions, and engine failures. The orchestrator maps codes to
controlled user messages without exposing implementation details.

The existing `PlanProposal` remains the planner/editor boundary. Preview,
atomic Apply, and Undo/Redo remain editor responsibilities and are unchanged.
Contract v1 and `RoomProject` remain unchanged.

### Determinism and characterization

The planner is deterministic: no randomization, explicit lexical comparison,
stable scene-entity iteration, stable candidate-provider order, stable
dimension order, and stable selection tie-breaking. The exhaustive search
budget is only a safety limit; it does not introduce another search strategy.

Characterization tests freeze successful TV proposals, including moves,
transforms, ordering, scores, findings, finding order, already-good behavior,
improvement-too-small behavior, circulation-priority behavior, and repeated
deterministic output. Any change to those observations requires correcting the
implementation rather than weakening the frozen assertions.

## Explicit non-goals

G1 does not include:

- Conversation scenario;
- Contract v2;
- Universal Scene Projection;
- a circulation/openings model;
- Semantic Furniture Core implementation;
- AI routing;
- backend or authentication;
- a product catalog system;
- a search-algorithm rewrite.

## Deferred decisions

- Universal Scene Projection -> G2A;
- Conversation scenario -> G2B;
- Contract v2 -> after a second deterministic scenario proves the need;
- circulation and openings -> derived spatial facts track;
- search optimization -> only after measured candidate cardinality or latency
  justifies it.
