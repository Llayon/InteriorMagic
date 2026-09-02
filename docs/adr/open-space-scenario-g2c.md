# Open Space Scenario G2C

## Status

Implemented as the third deterministic consumer of the Living Room Layout
Engine. The scenario is intentionally opt-in; no editor or AI routing is
added by this track.

## Scope

`planOpenSpace` optimizes perceived airiness in two bounded passes:

1. one sofa, the nearest eligible armchair, and the nearest eligible coffee
   table are arranged as a seating cluster;
2. eligible floor plants, lamps, rugs, side tables, consoles, and floor decor
   are placed greedily in lexical asset order using wall-biased candidates.

Additional sofas/chairs/tables, wall/derived entities, TVs, and unrelated
roles remain fixed context. All active objects must remain inside the room,
outside immediate openings, collision-free, and maintain a minimum estimated
path width of 0.6 m.

## Determinism and geometry

Candidate order, nearest-item selection, decor order, movement cost, and
tie-breaking are deterministic. `floorOpenArea`, `edgeBias`, `clusterCentroid`,
and the conservative `pathWidth` estimate are pure spatial facts. Occupancy
uses an axis-aligned union approximation for rotated rectangles; this is
explicitly a v1 heuristic, not a physics or navigation solver.

The shared engine remains scenario-neutral. Its optional
`arrangementConstraint` callback supplies the generic hook for the
mode-specific path-width hard rule; all weights, candidates, and findings
remain owned by G2C.

## Compatibility and deferrals

The output is the existing `PlanProposal` consumed by Preview, atomic Apply,
Undo, and Redo. Planning Contract v1, RoomProject, and TV/Conversation
behavior remain unchanged. Largest-contiguous-region exact geometry,
multi-zone open plans, window-light optimization, and `generalLiving` are
deferred to a later track.
