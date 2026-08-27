# Semantic Furniture Core v1

## Status

Accepted for Track G2E. This ADR is the final mandatory architecture freeze for
Track G v1. It defines an authority boundary; it does not activate production
catalog spatial facts or change planner behavior.

## Context

`FurnitureAssetDefinition` is the current resolved application aggregate. It
contains several kinds of data together:

- descriptive and spatial fields such as `semantic.role`, `dimensions`,
  `footprint`, and `placement.anchor`;
- rendering and import data such as model URLs, variants, and normalization;
- catalog and UI data such as names, icons, categories, tags, and thumbnails;
- editor policy such as collision configuration, snapping, rotation steps, and
  interaction padding.

The aggregate is useful, but membership in that type does not make every field
part of one semantic contract. In particular, type presence is not evidence of
production authority. A `FurnitureAssetDefinition` may be structurally complete
while its spatial values are prototype, fixture, fallback, or otherwise
unapproved for production semantic or spatial use.

The current production selection contains directly curated semantic roles, but
it does not contain authoritative production dimensions, footprints, anchors,
or canonical-orientation evidence. `prototype-placement.json` is explicitly
preview-only and non-authoritative. Its raw scene bounds must not be promoted to
production facts.

Planning already has the desired policy separation. `projectPlanningScene()`
projects explicit asset metadata into a factual `PlanningScene`; TV and
Conversation modules then own applicability, active-group selection,
candidates, rules, weights, thresholds, and findings.

## Decision

Semantic Furniture Core v1 is the smallest shared descriptive and spatial
vocabulary needed between an authoritative asset definition and deterministic
planning. Its conceptual shape is:

```ts
type FurnitureSemanticFactsV1 = Readonly<{
  role: FurnitureSemanticRole;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  footprint: {
    width: number;
    depth: number;
  };
  placementAnchor: PlacementAnchor;
}>;
```

This is an architectural model, not a new exported TypeScript type. G2E does
not refactor `FurnitureAssetDefinition` or create a second runtime aggregate.
A concrete type or wire artifact should be introduced only when K1 supplies a
real producer and consumer boundary.

### Curated descriptive role

`role` is the curated descriptive classification for an asset. A role becomes
production semantic authority only after provenance-backed review for the
corresponding asset content. Presence in a curated selection manifest alone is
not sufficient evidence of semantic correctness. It records what the object
is treated as by the application; it does not decide whether that object is
suitable for a particular planning scenario.

Role must not be inferred from geometry, `sourceCategory`, `displayCategory`,
catalog category, name, tags, `assetId`, or model node names. A known semantic
mismatch blocks planning/runtime activation until the owning semantic catalog
is corrected or superseded.

For example, `armchair` is descriptive authority. Whether an armchair is an
eligible Conversation participant is scenario judgment based on the complete
`PlanningScene` and the Conversation applicability policy.

Role is not inferred from geometry. It is not inferred from catalog category,
source category, display category, tags, names, asset IDs, or model node names.
When an explicit semantic role is absent, scene projection preserves the
current fail-safe behavior and emits the planning-layer fallback `obstacle`.
`obstacle` is not a `FurnitureSemanticRole` and must not be written back as an
asset classification.

### Category is not part of Core v1

The repository currently has multiple taxonomies with different owners:
`FurnitureAssetDefinition.category`, producer source categories, and catalog
display categories. None is planning authority, and none may be used to derive
`FurnitureSemanticRole`.

Core v1 therefore does not introduce `FurnitureCategory` or a fourth taxonomy.
A shared category vocabulary requires a concrete cross-domain consumer and a
separate mapping decision.

### Canonical dimensions

`dimensions` describes the normalized canonical asset bounds in meters:

- width is measured on X;
- height is measured on Y;
- depth is measured on Z.

The canonical asset convention remains global: one unit is one meter, +Y is
up, +Z is furniture forward, and the origin is at the center of the XZ
footprint on the support plane. Per-asset `canonicalForward` or `originMode`
fields are unnecessary in Core v1.

Import normalization is the adapter that brings a source model into this
coordinate system. Normalization instructions are not themselves semantic
facts. Runtime mesh measurement may audit curated dimensions, but measured
mesh bounds do not automatically become authoritative metadata.

### Canonical rectangular footprint

`footprint` is the authoritative canonical rectangular XZ occupancy used by
the current 2.5D planning and collision model. It is expressed as positive
width and depth in meters in canonical asset coordinates.

The footprint is not automatically derived from rendered mesh bounds and need
not equal `dimensions.width` by `dimensions.depth`. Core v1 does not promise
polygonal, concave, multi-level, or other Geometry v2 footprints.

### Placement anchor

`placementAnchor` describes the support or attachment class: `floor`, `wall`,
`surface`, or `ceiling`. It does not choose a placement position and does not
state that every current planner can move the asset.

The current `PlanningScene` representation supports floor and wall facts.
Surface and ceiling anchors remain valid descriptive values but fail closed at
the current projection capability boundary until a richer spatial model exists.

## Facts and policy

The architectural ownership chain is:

```text
asset/catalog pipeline
        -> curated semantic + authoritative spatial facts
        -> resolved FurnitureAssetDefinition
        -> factual PlanningScene
        -> scenario applicability
        -> active-group selection
        -> candidates / rules / scenario policy
        -> deterministic search
        -> PlanProposal
        -> editor commit
```

Semantic Furniture Core v1 must not contain:

- `supportsConversation`, `goodForTvViewing`, or other scenario capabilities;
- facing recommendations, preferred distances, or seating priority;
- active-group or movable membership;
- candidates, weights, thresholds, movement costs, or search limits;
- Feng Shui scores or other scenario judgments;
- user preferences, AI output, or UI state;
- catalog presentation or rendering configuration.

Collision configuration may be deterministic runtime or spatial metadata, and
it is currently copied into `PlanningScene`, but it is outside Semantic
Furniture Core v1. The core is a minimal shared vocabulary, not the complete
set of factual fields in `FurnitureAssetDefinition` or `PlanningScene`.
Snapping, rotation steps, and interaction padding are likewise editor policy,
not semantic core facts.

Geometry measures. Metadata describes. Applicability decides what matters.
Active groups decide what moves. Rules prescribe and judge. Search chooses.
The editor commits.

## Projection boundary

`projectPlanningScene()` remains the only application projection from
`RoomProject` plus resolved asset definitions into the current planning scene.
It may carry only facts and deterministic runtime spatial configuration
supported by that representation. It must not infer scenario topology,
movability, focal status, suitability, candidates, or weights.

The projection is intentionally lossy. Current planning uses the rectangular
footprint but does not need the full asset height or catalog presentation data.
The existence of a semantic fact does not require every fact to be copied into
every `PlanningScene` version.

TV and Conversation remain the empirical ownership examples:

- TV applicability owns its sofa, armchair, coffee-table, focal, and movable
  compatibility policy;
- Conversation applicability owns its sofa requirement, eligible armchairs,
  nearest-two selection, and deterministic tie-breaking;
- both scenarios own their candidate geometry, rule evaluation, weights,
  selection thresholds, and findings;
- the shared engine owns deterministic mechanics only.

## Authority and versioning

Semantic and spatial facts are authoritative only when provenance-backed and
bound to the exact immutable asset content they describe. That immutable
identity may be represented by a release-layer asset revision identifier when
one exists, or by deterministic provenance/content hashes before such a release
identity exists. G2E does not require K1 to mint the future runtime
`assetRevisionId`. Required fields, non-null values, raw mesh bounds, and
successful TypeScript compilation do not establish that authority.

Presence of role, dimensions, or footprint fields does not by itself establish
semantic or spatial production authority. Runtime mesh bounds may be audit
evidence but are not automatically authoritative. This is an authority-model
clarification only; it does not fix the Production Selection, import K1
evidence into G2E, or modify catalog runtime.

K1 activation requires provenance-backed authoritative facts, not merely
non-null `FurnitureAssetDefinition` fields. Its artifact must distinguish:

- a schema version, which describes the facts format;
- deterministic provenance/content hashes, such as `sourceSha256` and
  `canonicalSha256`, which bind the facts to the exact immutable asset content;
- a release-layer asset revision identifier when one exists;
- provenance or evidence sufficient to audit the values.

The schema version belongs at the facts artifact or manifest boundary. It is
not copied into each planning goal, `RoomProject`, `PlanningScene`, or
`PlanProposal`. Planning is deterministic for the resolved fact set in one
application release. Reproducing historical planning behavior across changing
catalog releases would require a separate persistence/version-pinning decision
and is not part of G2E.

## K1 handoff

Before production activation, K1 must provide a deterministic, validated fact
set keyed by unique `assetId` and provenance-bound to the exact
inspected/canonicalized asset content. The spatial facts artifact is not
required to duplicate `semanticRole` or mint `assetRevisionId`. A
planning-enabled record must have:

- an explicitly curated `FurnitureSemanticRole`;
- finite positive canonical dimensions in meters;
- an authoritative finite positive rectangular footprint;
- a placement anchor;
- canonical orientation and origin compliance evidence;
- schema and content versioning plus provenance.

K1 must not derive role from names, categories, tags, geometry, or source
filenames. It must not equate raw mesh bounds with dimensions or footprint
without an explicitly approved curation/measurement authority. It must not use
the current prototype placement artifact as production evidence, and it must
not add planner suitability, candidates, weights, thresholds, or search policy
to asset facts.

G2E does not prescribe whether K1 extends an asset-definition artifact or
publishes a separate facts artifact. Whichever representation it chooses must
be validated before materialization into the resolved
`FurnitureAssetDefinition`; planners must not import catalog manifests or K1
artifacts directly.

## Consequences

- `FurnitureAssetDefinition` remains unchanged in G2E.
- `FurnitureSemanticRole` and `PlacementAnchor` remain unchanged.
- Missing explicit role continues to project as planning-layer `obstacle`.
- Production role curation does not make current prototype spatial values
  authoritative.
- Planning scenarios cannot move their judgments into asset metadata.
- Collision metadata can continue to reach `PlanningScene` without becoming
  part of the semantic core.
- `PlanningScene`, `RoomProject`, `PlanProposal`, TV, Conversation, search,
  collision behavior, and G2C characterization remain unchanged.

## Non-goals

G2E does not implement or redesign:

- K1 Asset Spatial Facts or production catalog activation;
- OpenSpace, G3, Feng Shui, or another planning scenario;
- Geometry v2, polygon footprints, doors, windows, or circulation;
- catalog taxonomy unification;
- collision, snapping, rotation, or interaction policy;
- runtime asset loading or normalization;
- planner heuristics, active groups, candidates, rules, or search;
- `RoomProject`, `PlanningScene`, Planning Contract v2, or `PlanProposal`.

With this boundary accepted, the required Track G v1 foundation is closed and
frozen. Future scenarios require a separate product requirement; K1 is the
first expected implementation consumer of this architectural contract.
