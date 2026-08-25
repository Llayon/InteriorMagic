# ADR: K1 — Production Asset Coordinate Contract

> **Status:** Frozen for K1 (Track: K1 — Production Asset Spatial Truth, Plan Amended v3).
> **Scope:** Authoritative editor-scale spatial contract for the 47 frozen production
> `assetId`s in `src/editor/catalog/data/production-catalog-v1.json`. **No runtime,
> no R2, no AR.**
> **Companion plan:** `.hermes/plans/2026-08-25_214943-k1-production-asset-spatial-truth.md` (Amended v3).
> **Companion types:** `src/editor/catalog/k1/types.ts` (FACTS + EVIDENCE namespaces).
>
> This ADR is the **canonical reference** for:
> - The editor coordinate system (+Z forward, Y-up, units = meters).
> - The canonical origin invariant for floor-anchored assets (XZ midpoint at world origin, `min.y ≈ 0`).
> - The numerical tolerance table (DIMENSION / FOOTPRINT / FLOOR_CONTACT / ORIGIN epsilons).
> - The footprint policy catalog.
> - The translation order enforced during canonicalization (post-rotation bounds first).
> - The explicit NON-claims (no `realWorldScale`, no `plannerEligible`, no `arEnabled`, no `assetRevisionId`).

---

## 1. Decision

K1 establishes the canonical coordinate contract below for every asset in the
frozen production selection. The contract is **editor-scale only**. It is the
single source of truth for what the committed facts artifact
(`production-asset-facts-v1.json`) and the committed non-binary evidence ledger
(`production-asset-spatial-evidence-v1.json`) attest.

## 2. Coordinate system (verified against existing code)

| Concept        | Value                       | Evidence |
|----------------|-----------------------------|----------|
| `units`        | meters                      | committed facts use SI throughout |
| `Y`            | up                          | `src/editor/placement/placement.ts:19` (`position: { ...resolved, y: 0 }` for floor candidates) |
| Ground plane   | `XZ` (Y = 0)                | placement engine anchors floor candidates to `y: 0` |
| `semanticForward` | **`+Z`** (frozen)        | see §2.1 (verified with `xzHeading` + `backward` vector) |
| `rotationY`    | angle about world `+Y`, computed by `xzHeading(from, to) = atan2(to.x - from.x, to.z - from.z)` | `src/editor/spatial/geometry.ts:66` |

### 2.1 Code-grounded evidence for `+Z` as semantic forward

K1 does NOT infer the forward axis from Box3, source filename, or `sourceCategory`.
The forward convention is a **project-wide editor invariant** proven by two
co-located lines of code:

1. **`src/editor/spatial/geometry.ts:66`** — the planner's heading primitive:
   ```ts
   export const xzHeading = (from: Vec2, to: Vec2): number =>
     Math.atan2(to.x - from.x, to.z - from.z);
   ```
   `atan2(dx, dz)` returns the angle about `+Y` that points from `from` to `to`.
   When `to.z > from.z` (target is forward in Z), the angle is `0` — i.e. the
   default "no rotation" pose already faces `+Z`. Same primitive drives the TV
   planner (`tv/planner.ts:35,68,102`).

2. **`src/editor/planning/conversation/planner.ts:27`** — the rear boundary
   score, which is only meaningful if the planner's notion of "backward"
   matches the project's notion of forward:
   ```ts
   const backward = { x: -Math.sin(transform.rotationY), z: -Math.cos(transform.rotationY) };
   ```
   At `rotationY = 0`: `backward = (0, -1)` ⇒ **`forward = +Z`**.

Both lines exist on K1_BASE_SHA and are unchanged by K1. Freezing `+Z` here
matches every planner that calls `xzHeading` directly (TV + conversation). K1
therefore freezes `canonicalForward === '+Z'` on every committed facts record.

## 3. Canonical origin invariant (Plan v3 #1)

**Floor-anchored assets** MUST satisfy the canonical origin invariant after
canonicalization:

```
midpointX = (Box3.min.x + Box3.max.x) / 2     ≈ 0   (within ORIGIN_EPSILON_M)
min.y     = Box3.min.y                        ≈ 0   (within FLOOR_CONTACT_EPSILON_M,
                                                    symmetric abs() check per guardrail #1)
midpointZ = (Box3.min.z + Box3.max.z) / 2     ≈ 0   (within ORIGIN_EPSILON_M)
```

The XZ midpoint sits at world origin so the footprint center = placement origin
(the planner's rotation anchor). Y is lifted so the lowest point touches `y=0`
(floor contact).

### 3.1 Anti-pattern (do NOT do this)

> ❌ Translating `Box3.min → (0, 0, 0)` shifts the asset to one corner
> of its AABB instead of centering the footprint on the placement origin.
> K1 forbids this translation.

### 3.2 Wall-anchored assets (Plan v3 #2)

The canonical XZ origin is the same (midpoint), but **Y range covers the
vertical extent** of the asset (mounting box height), and the floor-contact
invariant does NOT apply.

> **Wall placement contract — PLACEHOLDER (filled in Commit 2 if RAW QA finds wall assets).**
>
> Per Plan v3 #2 / A19, if any asset in the 47 is classified by RAW QA as
> `anchor === 'wall'`, the wall coordinate contract is appended here BEFORE
> any wall asset is canonicalized. The contract will define:
> - The Y-range assertion (`canonicalBox3.min.y <= WALL_LOWER_EPSILON_M`
>   and `canonicalBox3.max.y - canonicalBox3.min.y >= wallMount.height - ε`).
> - The XZ midpoint invariant (same as floor).
> - The editor placement report: `editorPlacementSupport === 'unsupported'`
>   (the placement engine cannot place wall assets as of K1).
> K1 reports wall assets as `anchor='wall', editorPlacementSupport='unsupported'`
> if the engine cannot place them; K1 does NOT modify the placement engine.

## 4. Translation order (Guardrail #1 — post-rotation bounds)

Canonicalization applies the rotation correction **first**, refreshes world
transforms, **then** measures Box3 from the rotated scene. Only after that are
midpoint and `min.y` derived and the translation computed:

```
1. Apply rotation correction to the source scene.
2. scene.updateMatrixWorld(true)  — refresh world transforms.
3. Re-measure Box3 from the ROTATED scene.
4. midpointX = (postBox3.min.x + postBox3.max.x) / 2
   midpointZ = (postBox3.min.z + postBox3.max.z) / 2
   minY      = postBox3.min.y
5. T = (-midpointX, -minY, -midpointZ)
6. Apply T.
```

**Why post-rotation, not pre-rotation?** A non-zero rotation correction
(e.g. `Math.PI` for a `-Z` source) flips the XZ AABB. Pre-rotation midpoint
is wrong after rotation. Translating by a pre-rotation midpoint puts the
asset off-center.

**Why symmetric `abs(min.y)` for floor contact?** (guardrail #1 continued)
`min.y ≤ FLOOR_CONTACT_EPSILON_M` alone is asymmetric: a translated-DOWN
asset could pass `min.y ≤ ε` while sitting at `-3.5m`. The symmetric
assertion `abs(canonicalBox3.min.y) <= FLOOR_CONTACT_EPSILON_M` rejects
both directions. The floor-contact translation is `T.y = -min.y`, so the
post-translation `min.y` is exactly `0` and `abs(min.y) == 0`.

## 5. Numerical tolerance table

| Constant                  | Value  | Used in (hermetic / upstream)                                              | Rationale |
|---------------------------|--------|----------------------------------------------------------------------------|-----------|
| `DIMENSION_EPSILON_M`     | `0.01` (1 cm)  | `abs(width_facts - width_canonical) <= 0.01`; footprint ≤ dimensions + 0.01 | Box3 measurement noise on rotated re-exports |
| `FOOTPRINT_EPSILON_M`     | `0.02` (2 cm)  | reserved for footprint-vs-dimensions equality checks in upstream test | footprint is policy-derived, looser bound |
| `FLOOR_CONTACT_EPSILON_M` | `0.005` (5 mm) | `abs(canonicalBox3.min.y) <= 0.005` for floor assets | floor contact is a tight invariant |
| `ORIGIN_EPSILON_M`        | `0.005` (5 mm) | `abs(midpointX) <= 0.005` AND `abs(midpointZ) <= 0.005` (Plan v3 #1) | canonical origin alignment |

These four constants are the ONLY tolerances enforced by K1 hermetic tests.
Outlier sanity (e.g. dimensions in 0.05..5m) is **NOT** a hermetic invariant
(Plan v3 #5). Outliers belong to RAW visual QA and the final report, not to
the CI gate.

## 6. Editor-scale vs real-world-scale disclaimer (verbatim from spec §6)

> **The committed spatial facts are EDITOR-SCALE values.** They describe the
> geometry of the production runtime GLBs as authored by ITHappy and ingested
> into the InteriorMagic editor at the meter scale the placement engine uses.
> They are NOT certified real-world-scale measurements. No asset in the K1
> selection carries an `realWorldScale: true` claim, a measurement certificate,
> or any assertion that one meter in the editor equals one meter in a physical
> room. K1 records dimensions, footprint, and placement for **editor use** —
> layout, planner heuristics, and collision. Physical scale, AR true-scale,
> and any consumer-facing dimension claim require a separate rights-clarified
> measurement track (out of scope for K1, deferred to K2/K3 per Plan §7 Q1).

K1 explicitly does **NOT** claim, record, or imply:
- `realWorldScale` (the field name itself is forbidden on every K1 artifact — see §8).
- `plannerEligible` (planner untouched; planner applicability belongs to the
  separate `validateConversationApplicability` / TV planner applicability).
- `arEnabled` (AR0 is out of scope; the planner, model, scene, and worker code
  carry no AR hooks).
- `plannerApplicable` (forbidden field; redundancy with `plannerEligible`).

## 7. Footprint policy catalog (Plan §1, amendment #5)

| `semanticRole` | Default policy                  | Special method condition |
|----------------|---------------------------------|--------------------------|
| `sofa`         | `full-xz-envelope`              | n/a |
| `armchair`     | `full-xz-envelope`              | n/a |
| `coffeeTable`  | `full-xz-envelope`              | n/a |
| `console`      | `full-xz-envelope`              | n/a |
| `floorLamp`    | `full-xz-envelope`              | `lower-band-review` ONLY if visual evidence shows the shade/foliage envelope clearly overstates physical blocking |
| `plant`        | `full-xz-envelope`              | `lower-band-review` ONLY if visual evidence shows foliage envelope clearly overstates physical blocking |
| `rug`          | `full-xz-envelope` (ground extent = spatial fact; collision behavior is separate policy) | n/a |
| `tv`           | `full-xz-envelope` if standalone; `full-xz-envelope-tv-wall` if wall-mounted | per-asset visual classification |

The footprint policy is recorded as a string per asset in the committed facts
artifact, with a `footprintMethodEvidence` note in the evidence ledger pointing
to the visual QA verdict that justified any non-default method.

> K1 does NOT introduce multipliers (no `0.9 × width`, no `0.95 × depth`,
> no "legroom" justification baked into spatial facts). Legroom and clearance
> are **interaction policy**; the fact layer records the physical XZ envelope.

## 8. Explicit non-claims (forbidden field list)

K1 produces ZERO of the following fields anywhere in committed artifacts:

| Field              | Why forbidden                                                |
|--------------------|--------------------------------------------------------------|
| `assetRevisionId`  | minted only at production release construction (Plan A15); K1 binds by SHA256 instead |
| `modelUrl`         | not committed; runtime resolution is out of scope            |
| `signedUrl`        | R2 delivery is out of scope                                  |
| `r2Key`            | R2 delivery is out of scope                                  |
| `sourceCategory`   | **forbidden as authority**; usable only as audit-row label   |
| `realWorldScale`   | out of scope (see §6 disclaimer)                             |
| `plannerEligible`  | planner untouched; applicability is a planner concern        |
| `arEnabled`        | AR0 not in repo                                              |
| `plannerApplicable`| redundant with `plannerEligible`                             |
| `semanticRole`     | Production Selection owns it; K1 facts MUST NOT duplicate   |

Forbidden fields are enforced by **deep object scan** in
`tests/catalog/k1-spatial-facts.test.mjs` (Task 5.1). Any occurrence of
these strings as object keys in the committed facts artifact OR in the
committed evidence ledger fails CI.

## 9. Capability language (spec §21)

| Capability                  | Established by K1? |
|----------------------------|--------------------|
| Visible                    | YES (existing `getVisibleIds`) |
| SpatiallyPlaceable         | YES — committed facts artifact, gated by tests |
| ProductionRuntimeEligible  | NO (rights CLARIFICATION REQUIRED; no K2/K3 work in K1) |
| PlannerApplicable          | NO (planner untouched) |
| `AREligible`               | NO (out of scope; explicit disclaimer) |

## 10. Facts/evidence split (Plan v3 #3)

| Artifact                                                                | Lives in                                                              | Carries                                                                       | Does NOT carry                                                            |
|--------------------------------------------------------------------------|-----------------------------------------------------------------------|-------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `production-asset-facts-v1.json`                                         | `src/editor/catalog/data/` (committed)                                | `assetId`, `dimensions`, `footprint`, `placement`, `canonicalForward`         | hashes, transform details, QA verdicts, rotation correction, `semanticRole` |
| `production-asset-spatial-evidence-v1.json`                              | `src/editor/catalog/data/` (committed; non-binary)                    | `sourceSha256`, `canonicalSha256`, transform details, visual QA verdicts, row pointers, free-form `notes` | durable spatial meaning (that's what facts are for) |
| Source GLBs, canonical GLBs, renders, RAW/CANONICAL QA contact sheets     | `.agent-data/k1-production-assets/` (gitignored, local-only)           | the binaries themselves                                                       | (these ARE the binaries — they stay local)                               |

The facts artifact's `evidenceLedgerSha256` SHA256-stamps the ledger file,
binding the two committed JSON artifacts to each other.

## 11. Implementation notes (cross-references)

- **Types:** `src/editor/catalog/k1/types.ts` (FACTS namespace + EVIDENCE namespace).
  See the type file for `PlacementAnchor`, `EditorPlacementSupport`, `PlacementStatus`,
  `FootprintPolicy`, `ForwardApparentAxis`, `VisualQaVerdict`,
  `CanonicalQaSummaryKey`, and the per-asset record shapes.
- **RAW audit script:** `scripts/k1-audit-raw.mjs` (Task 2.1). Box3 only;
  no orientation inference, no forward inference, no multipliers.
- **Hermetic CI test:** `tests/catalog/k1-spatial-facts.test.mjs` (Task 5.1).
  This test NEVER reads `.agent-data` (Plan v3 #4 STRICT HERMETIC). It reads
  ONLY the committed JSON artifacts in `src/editor/catalog/data/`.
- **Frozen selection:** `src/editor/catalog/data/production-catalog-v1.json`
  is FROZEN (Hard Exclusion — spec §22). K1 reads it for membership + `semanticRole`
  audit labels only; K1 does NOT modify it.

## 12. Forward convention rationale (short)

The K1 plan §1.3 recon shows typical ITHappy production GLBs are authored with
the asset's back at `+Z` (sofa back at `+Z`, TV screen pointing `−Z`, etc.).
Because the project's planner primitive `xzHeading` returns `0` when the target
is forward in Z and `Math.PI` when behind, freezing `+Z` as the canonical
semantic forward means the **default `rotationY = 0` pose is the canonical
pose** for assets authored at `+Z`. Assets authored at other axes get a
per-asset rotation correction (`rotationCorrectionRadians`) recorded in the
evidence ledger, NOT in facts.

This is a deliberate departure from a Box3-driven forward inference: Box3
cannot distinguish `+Z` from `−Z` (the AABB is symmetric under Z-flip), so any
forward inference from Box3 alone would be guessing. The canonical
`canonicalForward: '+Z'` is a **planner-derived convention**, not a measurement.

---

**ADR signed off at K1_BASE_SHA `e156c8f727f04ae38d358c489fdc9c68e6618eb7`.**
**No subsequent edits to the placement engine, planner, model types, scene, workers, R2, AR, or RoomProject are part of K1.**
