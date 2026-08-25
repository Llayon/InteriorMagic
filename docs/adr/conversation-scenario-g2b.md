# Conversation Scenario G2B

## Status

Implemented as the second deterministic consumer of the Living Room Layout
Engine. This scenario does not change Planning Contract v1 or add UI routing.

## Scope

Conversation v1 requires exactly one floor, room-object sofa and at least one
eligible floor, room-object armchair. At most two eligible armchairs are active:
the nearest two to the sofa, sorted by distance and then lexical entity ID.
Ineligible and additional armchairs, coffee tables, and every unrelated entity
remain fixed context and collision obstacles.

The scenario owns applicability, active-group selection, candidate providers,
facing/distance/rear-boundary rules, weights, findings, and selection policy.
The shared engine remains scenario-neutral and is unchanged.

## Determinism and limits

Candidate order, active-group order, nearest-chair tie-breaking, exhaustive
search, movement-cost selection, and PlanProposal ordering are deterministic.
The bounded optimization neighborhood is one sofa plus at most two armchairs;
the rest of the room does not add candidate dimensions.

Coffee tables participate as fixed collision context but do not create a
candidate dimension in v1. Circulation is not advertised or synthesized while
authoritative circulation zones are absent.

## Compatibility and deferrals

The output remains the existing `PlanProposal` consumed by Preview / atomic
Apply / Undo / Redo. Contract v1, RoomProject, editor history, and TV policy
remain unchanged. Contract v2 and an external Conversation consumer are
deferred until a product surface or AI route requires them.
