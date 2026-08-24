# Layout Engine G2 Entry Checklist

Complete this checklist before starting G2A Universal Scene Projection.

- [ ] TV characterization remains byte-identical.
- [ ] Contract v1 is unchanged.
- [ ] Planner fixture E2E is green.
- [ ] Real planner E2E is green.
- [ ] Intent E2E is green.
- [ ] The engine has no scenario-specific assumptions.
- [ ] No editor mutation occurs inside planning.
- [ ] Repeated runs produce deterministic output.

The G2 entry review must also confirm that the `PlanProposal` -> Preview ->
atomic Apply -> Undo/Redo path is unchanged and that no directory rename or
hypothetical scenario abstraction is introduced before Conversation proves the
need.
