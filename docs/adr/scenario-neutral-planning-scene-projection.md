# Scenario-neutral PlanningScene Projection

## Status

Accepted for Track G2A.

## Decision

`projectPlanningScene()` is the factual projection boundary from `RoomProject`
and asset metadata into the existing rectangular `PlanningScene`.

The projection preserves entity identity, provenance, source order, transforms,
footprints, collision masks, supported placement type, and explicit semantic
metadata. Missing semantic metadata becomes `obstacle`; the projector never
guesses roles from names, categories, tags, or asset IDs.

The current PlanningScene geometry represents floor-plane XZ rectangles and
supports only `floor` and `wall` placement types. `surface` and `ceiling`
placement is rejected as unsupported until a spatial representation can model
vertical levels and support relationships without false 2D collisions.

The projector does not know TV topology, focal resolution, movable selection,
scenario applicability, weights, or findings. TV topology and focal policy stay
in `planning/tv`. Opening and circulation zones remain empty because the
current RoomProject has no authoritative opening facts.

`PlanningScene` remains a factual snapshot within the geometry supported by
v1; it is not a universal 3D room model.

## Consequences

TV and future scenarios receive the same scene facts while owning their own
applicability and active-group policy. The Living Room engine and the
PlanProposal → Preview → atomic Apply → Undo/Redo boundary remain unchanged.

Surface/ceiling support, openings, circulation, and richer spatial geometry are
deferred to a later spatial representation track.
