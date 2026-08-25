# ADR: Planning Contract v1

Status: superseded for native and AI producers by Planning Contract v2. Retained
only for explicitly versioned legacy TV compatibility; see
`planning-contract-v2.md`.

## Context

InteriorMagic is preparing parallel work on deterministic planning, AI intent parsing, planner preview UX, Telegram performance, and advisor/Feng Shui research. These tracks need one small shared vocabulary without freezing the deterministic planner's rapidly evolving spatial domain.

## Decision

Shared Contract v1 contains `PlanningGoal`, `PlanProposal`, `ProposedMove`, `PlanningFinding`, `PlanningScore`, and their small supporting scalar types. Only `PlanningGoal` has runtime structural validation in v1.

`PlanningGoal.focalPointId` references an opaque `PlanningEntityId` in the current planning context. It is not necessarily a `FurnitureInstance.instanceId`. Planning entity IDs must be deterministic and stable for the lifetime of the relevant planning context, but Contract v1 does not prescribe their string format or generation rules.

Priorities are ordered, unique expressions of relative user intent. Earlier entries have higher relative priority. Omitted priorities mean that a future deterministic rule pack uses its defaults; an explicitly empty array is invalid. Rule packs, not an LLM or caller, own numerical planner weights.

Contract validation checks structure and supported vocabulary. Contextual validation will later check that a focal point exists, is semantically compatible with the activity, and has valid provenance. The intent layer must choose from focal points supplied by its context rather than invent identifiers. `IntentContext`, `PlanningEntity`, provenance, and contextual validation are not part of Contract v1.

`PlanningScene` is disposable and belongs to the future deterministic planner domain. It is not a cross-track contract. RoomProject remains the unchanged serializable source of truth. A planner returns a proposal; the editor will later own preview, apply/cancel, and history.

## Architectural rules

1. Metadata describes. Rules prescribe.
2. Persist structure. Derive planning facts.
3. LLM interprets intent. Deterministic planner owns geometry.
4. PlanningScene is disposable; RoomProject remains truth.
5. Planner proposes; editor commits.
6. Parallelize implementations; centralize contracts.

## Ownership

- **Track A — Deterministic Planner:** owns PlanningScene, semantic integration, room projection, clearance interpretation, hard constraints, candidate generation, deterministic scoring, rule packs, and PlanProposal generation.
- **Track B — AI Intent:** owns natural-language-to-PlanningGoal conversion, structural schema validation at the boundary, provider integration, prompts, and evals. It does not own geometry, coordinates, collision, or scoring weights.
- **Track C — Planner UX:** owns loading, proposal and finding presentation, preview, apply/cancel, error, and retry behavior. It does not redefine PlanProposal.
- **Track D — Telegram Performance:** remains independent and does not modify planning contracts for performance purposes.
- **Track E — Feng Shui Research:** begins as research/specification and does not independently modify PlanningScene or RoomProject.

## Evolution

Version 1 is not permanently frozen. If implementation proves it insufficient, the contract evolves centrally rather than allowing parallel tracks to create incompatible variants. Planning entity resolution and provenance remain owned by the future PlanningScene/domain layer.
