# ADR: Planning Contract v2

Status: accepted for G2D.

## Context

Contract v1 represented only TV planning and exposed an optional ordered
`priorities` list. Those priorities have real deterministic TV scoring
semantics. Conversation planning now exists, but it intentionally has no focal
object. Inferring a contract version from a bare goal shape would be ambiguous:
the same priority-free TV object is valid in both versions.

## Decision

The canonical application and AI intent is a strict activity-discriminated
union:

```ts
type WatchTvGoalV2 = {
  activity: 'watchTv';
  focalPointId: PlanningEntityId;
};

type ConversationGoalV2 = {
  activity: 'conversation';
};

type PlanningGoalV2 = WatchTvGoalV2 | ConversationGoalV2;
```

`watchTv` requires one opaque, non-empty `focalPointId`. `conversation`
forbids `focalPointId` and requires no focal object. Both branches reject
unknown fields. Contract v2 contains intent, not a layout solution: coordinates,
transforms, candidates, active groups, collision decisions, rule weights,
priorities, thresholds, and search limits are forbidden.

There is no speculative direct-goal wire envelope. No current runtime boundary
transports or persists a ready `PlanningGoal`. The real browser/Worker planning
intent transport carries `contractVersion: 2`; that field means the Planning
Intent Contract version, not a generic Worker API version. Missing, unknown, or
mismatched transport versions fail closed.

Version-specific structural authorities are `parsePlanningGoalV1()` and
`parsePlanningGoalV2()`. Callers must choose a version explicitly; there is no
shape-guessing parser. Contract v1 remains the strict TV-only shape with
optional ordered `priorities`.

Legacy v1 requests use an explicit compatibility adapter. It converts the
public intent to a v2 TV goal and carries v1 priorities only as private migration
metadata into the TV scenario. This preserves the existing priority-slot
behavior. The metadata is not a public contract, AI output, persistence model,
or `PlanProposal`. Native application and AI paths use `PlanningGoalV2`
directly. V1 compatibility can be removed when every identified v1 producer is
retired and versioned request telemetry or an equivalent deployment audit shows
no remaining consumers.

One exhaustive router selects the deterministic scenario by `activity`:

- `watchTv` delegates to TV applicability, candidates, rules, and policy;
- `conversation` delegates to Conversation applicability, candidates, rules,
  and policy.

The router contains no geometry or scenario policy. Adding a future activity
requires explicit contract and routing review; compile-time exhaustiveness must
fail until its route is implemented.

The AI emits bounded intent only. Pure TV and pure Conversation requests are
representable. A request that combines activities or asks for relative planner
preferences/tuning returns `unsupported_intent`; it is not silently reduced to
a weaker goal. `ambiguous_focal` is TV-specific. Conversation proceeds with an
empty TV-focal context, and deterministic Conversation applicability remains
downstream of intent classification.

`PlanProposal` remains unchanged:

```ts
type PlanProposal = {
  moves: ProposedMove[];
  scoreBefore: PlanningScore;
  scoreAfter: PlanningScore;
  findings: PlanningFinding[];
};
```

Activity, version, provider data, request IDs, and search diagnostics stay in
upper-layer state when needed and never enter the proposal.

## Consequences

- Public v2 cannot tune deterministic planners.
- V1 priorities retain behavior only at the named legacy boundary.
- TV focal validation is activity-specific; Conversation never invents a fake
  focal ID.
- The default Analyze UI remains TV-only. Natural-language routing supports
  both activities without adding a Conversation button.
- Room projection, search budgets, collision logic, TV/Conversation heuristics,
  and representative G2C proposals remain frozen.
