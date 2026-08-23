# Feng Shui Rule Research v1

> Track E research-first specification for an optional future Feng Shui Rule Pack
> of InteriorMagic's planning / rule-pack system.
> Base: planning-contract-v1 (`0d6d30c54bae9aa11e0622ba7c512330725a7ebb`).
> Branch: `research/feng-shui-v1`. Worktree:
> `.agent-worktrees/feng-shui-research`.
> Date: 2026-08-23.

---

## 1. Purpose

This document specifies a small, defensible first set of spatial Feng Shui
recommendations that an InteriorMagic v1 room planner could surface as
**PlanningFindings** of an optional Feng Shui rule pack.

This is **not** a Feng Shui encyclopedia. It is a list of room-layout
recommendations that:

1. concern furniture / room layout,
2. have a reasonably clear spatial interpretation,
3. can be measured from a 2.5D `PlanningScene`,
4. can produce useful, understandable `PlanningFinding`s,
5. are relevant to common rooms (living room, bedroom, home office),
6. do not require mystical data that InteriorMagic cannot observe.

The deliverable is research / specification only. No code, no Spatial Core,
no PlanningScene, no UI.

---

## 2. Product Boundary

### 2.1 Feng Shui recommendation ≠ physical law

Feng Shui recommendations are a body of traditional Chinese spatial practice.
They are framed in the literature as "arrangements that help cultivate shū fú
(舒服) — harmony between the external environment and the human inhabitant."
They are *not* physical laws. Wikipedia's editorial position is that Feng Shui
"is generally regarded as non-scientific, while some scientific skeptics have
more narrowly classified it as a pseudoscience." [Source A]

InteriorMagic must respect this distinction in the product:

| Category                                    | Type                                       | Where it lives                           |
|---------------------------------------------|--------------------------------------------|------------------------------------------|
| "object physically blocks doorway at 34 cm" | objectively measurable / physical fact      | Ergonomics rule pack (or geometry layer) |
| "sofa floats in middle of room"             | design judgment with no Feng Shui ownership | Conversation / space-saving rule pack    |
| "headboard against solid wall, not window"  | Feng Shui recommendation                   | This pack                                 |
| "TV viewing angle 25°–35°"                  | ergonomic / geometric                      | TV-Viewing rule pack                      |

### 2.2 What the product will not claim

A future InteriorMagic UI **must not** present Feng Shui findings as
guaranteeing health, wealth, fertility, relationship outcomes, or any kind of
beneficial "energy" effect. The phrasing in §8 keeps this distinction visible
to the user. Where a Feng Shui recommendation overlaps with an independent
ergonomic or safety fact, both reasons should be communicated; the rule-pack
ownership remains with whichever domain owns the objective fact.

### 2.3 Architectural rules (binding)

The following binding principles from the planning-contract-v1 ADR and the
initial brief anchor this research:

- **Metadata describes. Rules prescribe.**
- **Persist structure. Derive planning facts.**
- **Geometry measures. Rules judge.**
- **One spatial truth; different consumers may apply different policies.**
- **PlanningScene is disposable. RoomProject remains truth.**

Concretely, this means: this research lists **spatial facts required** (e.g.
"nearest wall in a local direction", "angle from seat forward-axis to entrance
door"), not API names or functions. The Spatial Core decides the reusable
mathematical API. The Feng Shui rule pack only consumes facts.

---

## 3. Source Methodology

### 3.1 Sources reviewed

| Tier                       | Examples                                                                                                                  | Use                                            |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| Encyclopedic / academic    | Wikipedia "Feng shui" (en, with 36 academic citations including Bruun NIAS/Cambridge, Skinner, Paton Brill, Allan SUNY, Magli Springer, Vyse OUP); Wikipedia "Qi"; Wikipedia "Bagua"; Wikipedia "Hong Kong Disneyland"; Wikipedia "Lillian Too" | School taxonomy, foundational concepts, criticism provenance, real-world precedent |
| Traditional / practitioner | Jon Sandifer Form School (Learn Feng Shui course description); Lillian Too / WoFS (Woods-of-Feng-Shui article); Stephen Skinner *Guide to the Feng Shui Compass* (cited via Wikipedia) | Form / Compass school interpretation, practical modern application |
| Modern popular practitioner| Lillian Too's *Designing the Feng Shui of Bedrooms* (WoFS.com) — bedroom-level spatial examples                           | Confirmation that practitioner literature engages with bed/desk/housing arrangements |
| Skeptical academic         | Stuart Vyse *Superstition: A Very Short Introduction*; Robert T. Carroll *Skeptic Encyclopedia of Pseudoscience* (via Wikipedia); Ricci 1617 *De Christiana expeditione apud Sinas* (primary, via Wikipedia) | Critical context: framing, predictability claims, expert inconsistency |

All retrievals: 2026-08-23 (today).

### 3.2 Sources attempted but excluded

The following popular-practitioner sites returned Cloudflare blocks, 403s, or
were absent from the Internet Archive CDX index during this research window and
were therefore not cited: TheSpruce, House Beautiful, Real Simple, BHG,
Architectural Digest, Good Housekeeping, SFGate, WikiHow. Reddit r/FengShui and
Stack Exchange Interiors returned 403.

The exclusion is recorded honestly in `docs/research/feng-shui/_sources.md`.
This means the v1 product specification leans on Wikipedia's curated citation
chain, modern practitioner publishing (Lillian Too / Sandifer), and academic
secondary literature rather than the better-known English-language aggregator
sites. This is a deliberate research trade-off; it does not invalidate the
rules surfaced below, because Wikipedia's citations include Bruun (Cambridge),
Skinner, Paton (Brill), Magli (Springer), and Allan (SUNY) as primary
academic anchors, and Lillian Too is itself well-attested as the most
prolific modern English-language practitioner publisher (200+ books,
30+ languages, documented on Wikipedia).

### 3.3 Traditions / schools encountered

Wikipedia's school taxonomy (Source A) is the most authoritative we accessed.
It lists:

- **Form Branch (形勢派, Xingshi Pai)** — "oldest branch of feng shui,
  originated in Han dynasty *Book of the Tomb* by Qing Wuzi, expanded in
  *Book of Burial* by Guo Pu." Originally Yin House (tombs); extended to
  Yang House (homes). "Shape of the environment" oriented.
- **Compass Branch (理氣派, Liiqi Pai)** — "collection of more recent feng
  shui techniques based on the Eight Directions." Includes Flying Star and
  Eight Mansions. Uses the luopan.
- **BTB Black (Hat) Tantric Buddhist Sect** — categorized in Wikipedia as
  "Westernised or modern methods not based on Classical teachings."
- **Symbolic / New Age Feng Shui** — "methods that advocate substitution with
  symbolic objects."
- **Pierce Method** — "striking with soothing furniture arrangements to
  promote peace and prosperity" (Wikipedia).

These are recorded here so any future product mode toggle (e.g. "use classical
form school only") can be designed explicitly. The recommendations below are
the most cross-school-consistent, which is by design: a rule labelled
"cross-school-consensus" survives mode toggles; a school-specific rule does
not.

### 3.4 Confidence scale

> Per the brief: HIGH / MEDIUM / LOW is **research** metadata, not runtime
> metadata.

- **HIGH** — repeated across multiple credible/practitioner sources with
  substantially consistent spatial interpretation. May include mix of
  modern-popular + classical-form-school attestation.
- **MEDIUM** — common recommendation but wording, scope, or interpretation
  varies across sources.
- **LOW** — school-specific, weakly sourced, or highly interpretive.

---

## 4. Candidate Rules

Each rule below uses the spec format given in the brief, paraphrased for
clarity. **No code or function names appear in any rule.**

### 4.1 Rule FS-01 — Support behind primary seating

- **Rule ID:** `feng-shui.seating-support-behind`
- **Short name:** Support behind primary seating
- **Applies to:** living room / home office (sofa; primary armchair; desk-side
  chair)
- **Tradition / interpretation:** Form / common modern interpretation
- **Research confidence:** **HIGH**
- **User-facing meaning:** The principal location where a person sits is
  preferably arranged so that the sitter's back is against a wall or other
  substantial support, rather than being exposed to the room opening or a
  long vista behind them.
- **Applicability:** A primary seating entity (sofa, armchair, office chair
  spot) is one that is positioned for sustained sitting — not a side chair
  used only briefly. For a sofa, "behind" is the direction opposite its
  normal occupant-facing direction.
- **Exceptions / caveats:** Open-plan rooms may have only partial walls.
  Nooks formed by half-walls or bookcase-aligned benches may count as
  "support". A long window wall where the window covers most of the seat's
  back-side is generally a worse situation than a partial wall.
- **Required spatial facts:**
  - entity forward orientation (sitter's facing direction);
  - entity rear local direction;
  - nearest substantial wall / structure behind the seat and the distance to
    its face;
  - presence of a doorway / opening intersecting that local direction;
  - whether any major opening (window, door) extends across the entire rear
    wall area to the extent that no substantial solid segment remains.
- **Potential deterministic predicate (description only):**
  - Identify whether, in the seat's local rear direction, a wall segment of
    minimum height ≥ ceiling-height × 0.6 (heuristic), within distance X
    (e.g. 30–60 cm), exists without being dominated by an opening. The
    exact thresholds are NOT defined here — that is a Track A question.
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.seating-support-behind`
  - `code: supported-primary-seating` (positive)
  - `code: unsupported-primary-seating` (warning)
  - `params: { distance, supportType }` (e.g. `distance`= number (m),
    `supportType`="solid-wall" | "partial-wall" | "none")
  - `severity: positive | warning | info`
- **Severity:** warning (when absent), positive (when present, used as a
  reinforcing finding for other rules)
- **Implementation difficulty:** LOW — derivable from wall presence + entity
  orientation, which are also useful to ergonomics.

**Source notes:**

- This is one of the most consistent recommendations in modern popular
  practitioner writing. Source A confirms Form Branch's foundational concern
  with shape / support in the environment, but does not state the
  per-seat-specific "support behind" wording. The cross-school consensus on
  "something solid behind" is reflected in Sandifer's Form-School
  description ("what surrounds your home or business property to support
  it"), and Lillian Too's bedroom article emphasises rooms where the
  occupant is supported and balanced by their surroundings.
- Confidence was downgraded from universal-Feng-Shui-claim to **HIGH** rather
  than a stricter claim because the per-seat-specific phrasing originates in
  modern popular practice; the underlying intuition (support, enclosure) is
  classical Form Branch.

#### Source / claim discipline

- *Source-derived claim:* "Recommended in form-school and modern practitioner
  writing that the principal seat be backed by something solid, not exposed
  to the room's opening."
- *Our product interpretation:* Define "principal" by spatial role
  (sustained sitting), and define "support" by physical extent of solid
  wall in the rear local direction. The exact thresholds for what counts as
  "enough support" are deliberately left to Spatial Core / Track A.

---

### 4.2 Rule FS-02 — Command position (entrance in view, not directly aligned)

- **Rule ID:** `feng-shui.command-position`
- **Short name:** Command position — entrance in view, not in direct alignment
- **Applies to:** living room (primary seating); home office (desk);
  bedroom (bed — see FS-04)
- **Tradition / interpretation:** Form / Western popular; specific
  "commanding position" wording is most prominent in BTB and Black Hat
  lineages (per Source A).
- **Research confidence:** **MEDIUM-HIGH** (the spatial pattern is consistent;
  the *wording* and the *exact* angles vary across sources).
- **User-facing meaning:** The principal seat (and the desk) are preferably
  positioned so that the occupant can see the room's main entrance without
  sitting directly in line with it. A solid support behind the seat is
  understood as part of the same posture (overlap with FS-01).
- **Applicability:** A room has one principal entrance; if a room has
  multiple openings, the one that is the user's "main" entry into the
  seating area is the one to use. The relevant axis is the line of sight
  from the seated occupant, not the seat's geometric centre.
- **Exceptions / caveats:** Open-plan layouts; L-shaped rooms; entrances
  blocked by furniture. If the entrance is not in the seat's forward
  hemisphere at all, the rule is not engaged.
- **Required spatial facts:**
  - entity forward orientation;
  - position of principal entrance in the world;
  - angle between (a) the seated occupant's forward axis and (b) the line
    from seat to entrance centre;
  - distance from seat to entrance;
  - whether any major obstruction lies in that line of sight (overlap with
    TV-Viewing / Ergonomics line-of-sight facts).
- **Potential deterministic predicate (description only):**
  - Given the seat position and orientation, compute the angle from seat
    forward axis to entrance. If angle ∈ (≈0°, ≈30°), the seat is
    "directly aligned" with the entrance — warning. If angle is wide
    enough that the entrance sits within the seated occupant's natural
    peripheral-vision field (heuristic ~ ±90° off-axis), the entrance is
    "in view" — positive. Otherwise, the occupant cannot see the entrance
    — info (and arguably positive per some interpretations).
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.command-position`
  - `code: entrance-in-view` (positive)
  - `code: entrance-directly-aligned` (warning)
  - `code: entrance-out-of-view` (info)
  - `params: { angle, distanceToEntrance }` (numbers, degrees, metres)
  - `severity: positive | warning | info`
- **Severity:** warning (for direct alignment), positive (entrance-in-view)
  or info (out-of-view)
- **Implementation difficulty:** MEDIUM — requires entrance identification
  + occupant forward axis. The forward axis for an arbitrary entity could be
  derived from `orientationY` + a model-side "occupant forward" definition.

**Source notes:**

- This is sometimes called "commanding position" or "command position"
  in practitioner writing. FengShuied (Source K) explicitly: the
  command position is *"sometimes known as the armchair position, it is
  an orientation theory that is associated with form school feng shui
  and has little connotations with compass school feng shui"*
  (https://www.fengshuied.com/command-position, verified 2026-08-23).
  The article enumerates six criteria — backing support / not in line
  with doors / not under a beam — which together make up the modern
  Western practitioner consensus for command position.
- Wikipedia [Source A] describes BTB and Black Sect as explicitly
  "Westernised or modern methods not based on Classical teachings," and
  BTB lineage is the principal source of the specific "commanding
  position" phrasing.
- Form Branch has a related but broader concept — the *gua* / sector
  system historically did not use direct line-of-sight language. The
  modern "commanding position" wording is therefore a contemporary
  Western framing applied to a Form-style intuition.
- Confidence: **MEDIUM-HIGH** because cross-school consensus on "see
  the entrance without being in direct line" is widely attested in
  modern practitioner writing, but the *exact angle threshold* and the
  *importance of direct alignment* is a matter of school-specific
  interpretation. We therefore do not embed specific thresholds in the
  contract.

#### Source / claim discipline

- *Source-derived claim:* Modern practitioner writing (BTB lineage per
  Wikipedia taxonomy) recommends placing primary seats so the occupant can
  see the door and is not directly in line with it.
- *Our product interpretation:* Treat "command position" as one rule with
  three outcomes (in-view / aligned / out-of-view). The exact geometric
  thresholds are deliberately deferred.

---

### 4.3 Rule FS-03 — No direct long-axis alignment with doorway

- **Rule ID:** `feng-shui.no-direct-alignment-with-door`
- **Short name:** Avoid direct alignment of bed / desk long-axis with door
- **Applies to:** bedroom (bed); home office (desk); living room (primary
  seating) — see FS-02 for the seat-versus-entrance line-of-sight variant.
- **Tradition / interpretation:** Form School is the strongest advocate;
  Compass School also prohibits; BTB agrees with caveats. The Chinese
  traditional name is **"coffin position" 棺材位 / 棺材煞** ("coffin
  affliction"). The traditional term for door-versus-door sha qi is **鬥口煞
  (dou ko sha)** — "confrontational-mouth sha" (Source K).
- **Research confidence:** **HIGH** (raised from MEDIUM after subagent
  verification of practitioner-side consensus).
- **User-facing meaning:** A bed or desk positioned so that its long axis
  is directly aligned with a doorway is a soft no — i.e. the practitioner
  literature recommends against it. Two distinct sub-conditions are often
  conflated in popular writing:
  (a) **the long axis of the bed / desk** points at the door (i.e. the
      person lying down or sitting is on the same axis as the door);
  (b) **the doorway is in the seated / supine person's forward line of
      sight** — this is FS-02's "direct alignment" outcome.
  This rule concerns (a). It overlaps conceptually with FS-02; we keep them
  separate because the spatial predicates differ.
- **Applicability:** Beds in any position where the long axis intersects a
  doorway on the floor plane. Desks likewise. Sofas less commonly.
- **Exceptions / caveats:** A door that is recessed, angled, or has a
  visual screen in front of it (built-in closet, partition, half-wall) is
  widely regarded by practitioners as mitigating direct alignment. We
  therefore allow the rule to attach a `mitigation` parameter for future
  use but do not require it in v1.
- **Required spatial facts:**
  - long axis of bed / desk (a unit vector derived from the entity's
    orientation + bounding extent);
  - direction vector from entity centre to door centre;
  - distance from entity to door;
  - dot product (or angle) between long axis and direction-to-door;
  - **whether the door is at the foot of the bed (i.e. the *direction*
    from entity-to-door matches the foot-of-bed direction, not just any
    pointing direction)** — see sub-condition clarification in §10.8;
  - optionally: presence of intervening screen / partition between door and
    entity.
- **Potential deterministic predicate (description only):**
  - For each entity N (bed / desk), compute angle between its long axis
    vector and the unit vector from N to the relevant door. **Use a
    NARROW threshold band around the foot-of-bed direction** (e.g. ±~10°
    off the long axis at distance ≤ 3 m). Sub-condition: priority should
    be raised when the door sits at the *foot* end of the bed / desk
    (coffin position), not when the door is at the *head* end. The
    FengShuied (Source K) practitioner statement explicitly excludes
    diagonal alignments and bed-in-view-only situations.
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.no-direct-alignment-with-door`
  - `code: aligned-with-door` (warning)
  - `code: not-aligned-with-door` (positive, optional)
  - `params: { angle, distanceToDoor }`
  - `severity: warning | positive`
- **Severity:** warning (when aligned)
- **Implementation difficulty:** LOW — entity orientation + door position
  are already fundamental to TV-Viewing and Ergonomics rules.

**Source notes:**

- The "sha qi" framing has a long history but is school-specific.
  Form-Branch literature refers to direct alignment primarily via "long
  arrow" / "straight-line" arguments; Compass-Branch schools debate whether
  the same matter depends on the compass relationship between door and
  occupant. Modern practitioner writing (Lillian Too and successors)
  generalizes it as a "do not align the bed directly with the door" rule
  with a soft reasoning.
- Confidence is **MEDIUM** rather than HIGH because Compass-school sources
  may treat direction-of-the-door only via Eight Mansions / Flying Star
  formulas, which InteriorMagic cannot reasonably implement without
  bringing in Kua-number / birth-date data. We therefore frame v1 around
  the Form-broad / popular interpretation only.
- IMPORTANT: This rule is *not* the same as FS-02. FS-02 is about the
  occupant's forward line of sight to the entrance; this rule is about the
  long axis of the furniture being parallel to the entrance vector. They
  are usually consistent in popular writing but the InteriorMagic
  implementation should treat them as independent.

---

### 4.4 Rule FS-04 — Bed: headboard against a solid wall

- **Rule ID:** `feng-shui.bed-headboard-support`
- **Short name:** Bed headboard against a solid wall
- **Applies to:** bedroom
- **Tradition / interpretation:** Form / common modern interpretation;
  explicitly recommended in Lillian Too's WoFS bedroom material (Source C)
  and in Karen Rauch Carter's bedroom rule #8 (Source L) — verbatim: "Create
  a headboard for the bed and place it against the most solid wall in the
  room." KRC is a Professional Member of the International Feng Shui Guild;
  Lillian Too has 200+ books across 30+ languages per Wikipedia.
- **Research confidence:** **MEDIUM-HIGH**
- **User-facing meaning:** The bed's headboard is preferably placed against
  a solid, full-height wall section, not against a window wall or a
  half-height partition.
- **Applicability:** A bed in any position. The "headboard side" is
  typically a tagged sub-axis of the bed entity; if the asset definition
  does not tag the headboard side, the long-axis half farthest from any
  door (or any other heuristic) is a defensible default.
- **Exceptions / caveats:** Loft beds, platform beds without a headboard,
  cases where no full-height wall is available.
- **Required spatial facts:**
  - headboard-side direction;
  - nearest substantial wall behind that side;
  - ratio of window-to-wall in the wall segment closest to the headboard
    (for the "not under a window" co-finding);
  - distance from headboard to wall.
- **Potential deterministic predicate (description only):**
  - Determine the wall segment in the entity's headboard-direction. Score
    the length of solid wall (no window/door opening) within a short
    distance (e.g. within ~10 cm of the headboard) and a minimum extent
    (e.g. ≥ headboard width).
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.bed-headboard-support`
  - `code: headboard-on-solid-wall` (positive)
  - `code: headboard-on-window-or-half-wall` (warning)
  - `params: { wallLength, supportType }`
  - `severity: positive | warning`
- **Severity:** warning (when headboard fails), positive (when met)
- **Implementation difficulty:** MEDIUM — needs a "headboard side" tag on
  the asset or an equivalent heuristic. Wall-segmentation is a Track A
  concern.

**Source notes:**

- Lillian Too's *Designing the Feng Shui of Bedrooms* (WoFS, Source C)
  extensively discusses headboard placement, mattress quality, and material
  choices. The specific "headboard on solid wall" recommendation is one of
  the most repeated cross-school rules in popular practitioner writing.
- A common sub-rule "do not place bed under a window" is widely cited in
  modern popular writing but has weaker classical attestation; we are
  splitting it into FS-05 below as a separate rule with reduced confidence.

---

### 4.5 Rule FS-05 — Bed: not directly under a window

- **Rule ID:** `feng-shui.bed-not-under-window`
- **Short name:** Bed not directly under a window
- **Applies to:** bedroom
- **Tradition / interpretation:** Predominantly modern popular / BTB
  lineage; not a strong classical Form-Branch rule.
- **Research confidence:** **LOW-MEDIUM**
- **User-facing meaning:** The bed preferably does not occupy a floor
  position that places part of it directly under a window. The most
  common practitioner reasoning is two-fold:
  (a) the occupant loses "wall support" on the headboard side if the wall
      is a window (overlap with FS-04);
  (b) the bed's foot at a window is framed as the practitioner-side
      version of "sha qi" / unscreened flow.
- **Applicability:** Beds. Different sources target (a) the foot-of-bed
  pointing at a window vs (b) the headboard being on a window wall; some
  combine both. v1 emits one warning covering either condition.
- **Exceptions / caveats:** Windows with deep soffit or shielding; rooms
  with only one available wall.
- **Required spatial facts:**
  - bed footprint (rotated rectangle);
  - window positions (rectangles with rough sill height / extent);
  - intersection area between bed footprint and the vertical projection of
    any window;
  - distance from headboard-axis to nearest window;
  - distance from foot-of-bed-axis to nearest window.
- **Potential deterministic predicate (description only):**
  - Treat a window as a rectangle on a wall. Project the bed's footprint
    onto the floor plane and check overlap with the window's planar
    bounding rectangle (or a horizontal "sill band" approximating
    head-height visibility). If overlap > some threshold, warn.
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.bed-not-under-window`
  - `code: bed-under-window` (warning)
  - `params: { windowId, overlapPct }`
  - `severity: warning`
- **Severity:** warning (soft)
- **Implementation difficulty:** MEDIUM — needs window entities, which
  are not yet on the current furniture asset grid but are a plausible v2
  extension. **For v1, this rule is INCLUDE but emits a single warning if
  any opening overlaps the bed's footprint projection; an opening-in-wall
  approximation will be considered sufficient.**

**Source notes:**

- The "chi escapes out the window" framing is genuinely modern popular
  Feng Shui and not strongly traceable to classical Form School. Wikipedia
  does not state this rule. Lillian Too's bedroom article discusses
  materials and lighting but does not, in the captured excerpt, state the
  bed-under-window taboo explicitly; some Lillian-Too-authored article
  collections elsewhere do mention it. We therefore treat it as
  LOW-MEDIUM rather than HIGH.
- We still INCLUDE it in v1 because (a) the spatial predicate is
  genuinely implementable, (b) it has very wide practitioner-popular
  attestation, and (c) marking it warning rather than info lets the user
  ignore it. But we mark its confidence as LOW-MEDIUM in the matrix and
  expect the deterministic implementation to be one of the simplest.

---

### 4.6 Rule FS-06 — Desk: command position + view of door

- **Rule ID:** `feng-shui.desk-command-position`
- **Short name:** Desk not with back to door, ideally with door in view
- **Applies to:** home office (desk)
- **Tradition / interpretation:** Form / common modern interpretation;
  the same intuition as FS-02 but applied to a desk rather than a chair /
  bed.
- **Research confidence:** **MEDIUM-HIGH**
- **User-facing meaning:** A desk is preferably positioned so that the
  occupant has a solid wall behind them and can see the office's entrance
  without facing it directly.
- **Applicability:** Desk entities. Two predicates are required: (a) is
  there a wall behind the occupant? (b) is the door visible from the desk
  at an angle that's neither directly in front nor directly behind?
- **Required spatial facts:**
  - desk orientation;
  - occupant forward axis (derivable from desk orientation);
  - desk-to-entrance vector and angle;
  - nearest wall in the rear local direction and its distance.
- **Potential deterministic predicate (description only):**
  - Reuse the FS-01 and FS-02 predicates on the *desk+occupant* entity.
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.desk-command-position`
  - reuse FS-01 / FS-02 codes; or
  - `code: desk-command-position-met` (positive)
  - `code: desk-back-to-door` (warning)
- **Severity:** warning (back to door), positive (command met)
- **Implementation difficulty:** LOW — same facts as FS-01 + FS-02, just
  with a different entity role.

**Source notes:**

- The desk-specific framing is widely attested in modern practitioner
  writing. The Lillian Too / WoFS kitchen+office related materials we
  accessed recommend "facing the entrance" for primary work surfaces.
  Confidence here is at least MEDIUM-HIGH because the relevant intuition
  ("not with back to entrance") intersects with objectively safe behaviour
  (not having your back to a door reduces vulnerability in case of fire or
  other emergency) — but we deliberately keep that intersection
  conceptual, owned by the Ergonomics rule pack for the safety reason, and
  owned by this rule pack for the Feng Shui recommendation.

---

### 4.7 Rule FS-07 — Stove: command position, not back to door, not facing window

- **Rule ID:** `feng-shui.stove-command-position`
- **Short name:** Stove cook not with back to door, not facing window
- **Applies to:** kitchen
- **Tradition / interpretation:** Form / common modern; the kitchen
  application of the command-position concept.
- **Research confidence:** **MEDIUM**
- **User-facing meaning:** A stove / cooktop is preferably positioned so
  that the cook's back is supported by a wall and so that they can see
  the kitchen entrance without being in direct line with it. The cook
  should not face directly outward onto a window.
- **Applicability:** Stove entities; kitchen rooms with at least one
  entrance.
- **Required spatial facts:**
  - same as FS-02, with `entity = stove` and a designated `cookForwardAxis`;
  - stove-to-window relationship: a window directly in front of the cook
    is a separate sub-finding (informational).
- **Possible PlanningFinding mapping:**
  - `ruleId: feng-shui.stove-command-position`
  - `code: stove-command-position-met` (positive)
  - `code: stove-back-to-door` (warning)
  - `code: stove-facing-window` (info)
- **Severity:** warning (back to door), info (facing window), positive
  (command met)
- **Implementation difficulty:** MEDIUM — kitchen rooms may be modelled
  later in Track A. For v1, if the kitchen scene supports the predicates
  required for FS-01 / FS-02, FS-07 can be emitted from the same facts.

**Source notes:**

- The kitchen-stove version of "command position" is a moderate-strength
  cross-practitioner recommendation. FengShuied (Source K) explicitly
  enumerates the *six* command-position criteria — backing support, not
  in line with doors, etc. — and treats the kitchen stove as the same
  class of fire-element fixture as the fireplace
  (https://www.fengshuied.com/fireplace-feng-shui). Lillian Too's WOFS
  kitchen article collection (Source C surrounding articles, not the
  bedroom article captured here) consistently discusses it. Confidence
  is **MEDIUM** rather than MEDIUM-HIGH because kitchens are a more
  specialised recommendation and a first v1 planner is TV / living-room
  oriented; the rule is here in the matrix to ensure the v1 specification
  can later be extended without breaking contract.
- The form-school / compass-school distinction matters here too:
  FengShuied notes the "command position" is "associated with form
  school feng shui and has little connotations with compass school
  feng shui." Compass-school kitchen practice uses compass sector +
  Flying Star chart, not this rule. We follow Form-school because it
  is the implementable version.

---

### 4.8 Rule FS-08 — Sofa: direct alignment with kitchen / dining opening

- **Rule ID:** `feng-shui.seating-not-aligned-with-door-or-opening`
- **Short name:** Primary sofa not aligned with doorway or interior opening
- **Applies to:** living room (sofa)
- **Tradition / interpretation:** Form / common modern interpretation
- **Research confidence:** **MEDIUM**
- **User-facing meaning:** A long sofa positioned so that its long axis
  points directly at an entrance, opening, or frequently-used door invites
  practitioner-side reservations. Overlaps with FS-03 but is a sofa-on-floor
  specific case rather than a bed / desk concern.
- **Required spatial facts:** same as FS-03 (entity long-axis vs opening
  vector).
- **Possible PlanningFinding mapping:**
  - reuse FS-03 codes on entity = sofa
- **Severity:** warning
- **Implementation difficulty:** LOW

**Source notes:**

- This is the same spatial pattern as FS-03 simply applied to a sofa. We
  include it as a separate rule primarily to communicate to the user that
  the pattern is sofa-specific, and to allow different severity / wording
  in the UI.

---

## 5. Rejected / Deferred Rules

We list here rules that came up in research or initial brainstorming and
were deliberately NOT included in v1, with reasoning.

### 5.1 "Sharp corner / poison arrow from wall corners pointing at seat"

- **What it is:** Modern popular practitioner writing (BTB lineage)
  describes wall corners that point toward a seated occupant as "poison
  arrows" / "secret arrows".
- **Why deferred:**
  - **Spatial implementation is genuinely ambiguous.** "Pointing at" a
    seat requires not just a 2D footprint but an angular criterion
    (`angle-of-incidence` at the seat), and practitioners vary as to
    whether it is the corner's facing vector, the bisector of the
    adjacent walls, or the wall-segment extreme that counts.
  - Sources are predominantly modern popular; Form-Branch and
    Compass-Branch classical attestation is thin.
  - It does not have an independent ergonomic / safety anchor.
- **Decision: DEFER** — revisit in v2 if a reliable spatial
  `angle-of-incidence` predicate becomes available.

### 5.2 "Beams overhead (e.g. exposed beam above bed)"

- **What it is:** Practitioner recommendation to avoid sleeping or
  prolonged sitting directly under an exposed structural beam.
- **Why deferred:**
  - **Requires 3D data** InteriorMagic's current scene is 2.5D; beams
    above a bed are not in the persistent model.
  - Practitioner framing is again dependent on which school (Compass
    Branch cautions in particular about "rising beams" pointing at the
    head of the bed; Form Branch is less specific).
- **Decision: DEFER** — Track A's PlanningScene evolution should decide
  whether exposed beams are first-class entities.

### 5.3 "Mirror facing the bed"

- **What it is:** Modern popular practitioner recommendation that mirrors
  not face the bed directly.
- **Why deferred:**
  - Mirror is currently not a first-class furniture entity in
    InteriorMagic's catalogue (mirrors are usually modelled as material
    finish or as a decor object without orientation).
  - The rule's spatial implementation depends on whether a future asset
    system treats mirrors as furniture or surface decoration.
- **Decision: DEFER** — does not affect v1 because the asset model is
  unchanged in this track.

### 5.4 "Sector-based instructions" (Bagua / Kua / Flying Star / Eight Mansions)

- **What it is:** Compass-Branch recommendations that place auspicious
  directions, colours, materials by sector based on the occupant's Kua
  number (Eight Mansions / Flying Star).
- **Why deferred:**
  - **Requires birth-date / Kua-number data** that InteriorMagic
    currently does not persist. The brief explicitly listed these as
    out-of-scope ("Do NOT research implementation through mystical
    proxies", "Do NOT create runtime requirements such as: Kua formula,
    BaZi integration, Lo Shu calculations, elemental personality
    profiling").
  - Compass-school rules are internally consistent but require persona
    data to be useful, which we cannot assume.
- **Decision: REJECT** for v1. This is a clearly-out-of-scope product
  decision that should be revisited only if InteriorMagic explicitly
  adopts persona-bound planning.

### 5.5 "Lai See / Wealth corner / symbolic object placement"

- **What it is:** Practitioner-side recommendations to place wealth or
  relationship symbolic objects (water features, plants, crystals,
  decorative dragons) in specific sectors.
- **Why deferred:**
  - **Requires the user to provide their own asset catalogue semantics**
    (the rule's "wealth corner" is meaningless if the user does not
    model that sector as a wealth zone).
  - No spatial fact that is purely observational from RoomProject can
    derive a useful finding here.
- **Decision: REJECT** — out of scope.

### 5.6 "Direct alignment with window OR mirror (combined with FS-03 / FS-05)"

- This is a special-case overlap that was investigated and rolled into
  FS-05 (bed not under window) and FS-03 (no direct long-axis alignment)
  rather than treated as a fourth rule.

### 5.7 "Kua-number-based bed headboard direction"

- Out of scope per §5.4 (persona-bound).

### 5.8 "Door opening directly onto bed foot (coffin position)"

- This was investigated and substantially overlaps FS-03 (long-axis
  alignment with doorway). The two wordings are not different rules
  in geometric terms — they are the same predicate with different
  practitioner vocabulary. We collapse into FS-03.

### 5.9 "Qi Men Dun Jia / Flying Star time-of-occupation recommendations"

- Out of scope per §5.4 (persona-bound, time-dependent).

### 5.10 "Symbolic objects as remedies (e.g. specific crystals, plants in pots)"

- Out of scope — no spatial fact-only predicate; requires the user to
  have modelled the asset as a symbolic-decoration entity.

---

## 6. Required Spatial Facts (deduplicated inventory)

> Per the brief: these are FACTS, not API names. The Spatial Core / Track A
> picks the reusable mathematical API.

### 6.1 CORE (needed by ≥3 v1 rules)

| Fact                                             | Used by                | Notes                              |
|--------------------------------------------------|------------------------|------------------------------------|
| Entity forward orientation (entity.forwardAxis)  | FS-01, FS-02, FS-06, FS-07 | Also needed by TV-Viewing rule pack. |
| Entity rear local direction (derived from above) | FS-01, FS-06           | Owned by Track A's spatial domain. |
| Nearest wall / structure behind entity           | FS-01, FS-04, FS-06    | Length, height, position relative. |
| Distance to that wall                            | FS-01, FS-04           | Numeric, in metres.                 |
| Entrance position (room → entrance mapping)      | FS-02, FS-03, FS-06, FS-07, FS-08 | A room has one principal entrance. |
| Angle from entity forward-axis to entrance       | FS-02, FS-06, FS-07    | Degrees.                            |
| Distance to entrance                             | FS-02, FS-06, FS-07    | Metres.                              |
| Direct-alignment test (long axis vs door vector) | FS-03, FS-08           | Dot product or angle + threshold.   |
| Wall-segment solid length in a local direction   | FS-04                  | Length × height needed.              |

### 6.2 SECONDARY (needed by 1–2 v1 rules)

| Fact                                             | Used by      |
|--------------------------------------------------|--------------|
| Headboard-side direction of bed                  | FS-04        |
| Window entities (position + footprint)           | FS-05        |
| Overlap between bed footprint and window         | FS-05        |
| Stove forward-axis (occupant forward-axis)       | FS-07        |

### 6.3 DEFER (more complex / fewer rules yet)

| Fact                                             | Source rule(s)            |
|--------------------------------------------------|---------------------------|
| Sharp-corner incidence angle                     | §5.1 (rejected)            |
| Ceiling beam / overhead structure                | §5.2 (rejected)            |
| Mirror entities                                  | §5.3 (rejected)            |
| Sector grid (Bagua) — implicit in every Compass-school rule | §5.4 (rejected)     |

### 6.4 Things this inventory does NOT include

- Anything that requires birth date, Kua number, compass direction, time
  of day, owner identity (per the brief's "do not research implementation
  through mystical proxies").
- Mirrors, ceiling beams, or surface-finish metadata not on the asset
  catalogue.

---

## 7. Overlap with Other Rule Packs

The InteriorMagic rule-pack architecture distinguishes physically objective
facts from policy interpretations. Some "facts" that matter to Feng Shui also
matter to other packs; ownership is decided by the objective rule.

| Concern                                          | Rule pack that owns the *objective* fact | Feng Shui's role         |
|--------------------------------------------------|-------------------------------------------|--------------------------|
| Object physically blocks doorway                  | **Ergonomics / geometry**                 | not applicable            |
| Walkway width                                      | **Ergonomics**                            | not applicable            |
| Footprint overlap                                  | **Ergonomics / geometry**                 | not applicable            |
| TV viewing angle / distance                        | **TV-Viewing**                            | not applicable            |
| Seating angle to TV                                | **TV-Viewing**                            | not applicable            |
| Conversation grouping distance / arc               | **Conversation**                          | not applicable            |
| "Clear floor space for circulation"                | **Space-Saving / Ergonomics**             | Feng Shui may *reference* (rule FS-08) the same configurations without *owning* the metric |
| Wall behind primary seat                           | **Feng Shui** (this pack, FS-01)          | Feng Shui interpretation  |
| Door-to-seat line of sight                        | **Feng Shui** (this pack, FS-02 / FS-06)  | Feng Shui interpretation  |
| Bed long-axis alignment                           | **Feng Shui** (this pack, FS-03)          | Feng Shui interpretation  |
| Headboard on solid wall                            | **Feng Shui** (this pack, FS-04)          | Feng Shui interpretation  |
| Bed not under window                               | **Feng Shui** (this pack, FS-05)          | Feng Shui interpretation  |

**Key principle:** the *objective* Spatial facts (forward axis, distance to
wall, distance to door, etc.) live in the Spatial Core regardless of which
pack consumes them. Multiple rule packs may apply different policies on the
same fact. Feng Shui is one policy. Ergonomics may be another. They never
conflict at the geometric level — only at the interpretation level, and that
interpretation is what the user sees (different rule packs attached to the
same scene produce different but compatible findings).

---

## 8. UX Wording Guidance (Russian)

The product-facing framing for the v1 Feng Shui rule pack is **calm and
non-dogmatic**, distinguishes physical/ergonomic facts from Feng Shui
recommendations, and never promises guaranteed outcomes. Listed below are
representative phrases per rule. Final UI copy will be authored in Track C;
this is specification guidance.

### 8.1 Framing for the entire pack

> "Рекомендации по фэншуй — это традиционные советы по расположению
> мебели. Они могут подсказать более спокойные и сбалансированные
> расстановки, но не заменяют физические ограничения (эргономику,
> проходы, размеры мебели) и не гарантируют каких-либо результатов."

(A single short caption that goes on the rule-pack toggle or section header.)

### 8.2 Per-rule examples (Russian, sample)

- **FS-01 (support behind primary seating):**
  *Positive:* "За основным местом для сидения есть надёжная опора —
  стена или другая конструкция."
  *Warning:* "Спинка основного дивана / кресла не имеет плотной опоры
  сзади. В фэншуй это считается менее спокойным положением."

- **FS-02 / FS-06 (command position / entrance in view):**
  *Warning:* "С основного места для сидения вход в комнату находится
  прямо на линии взгляда. Многие рекомендации по фэншуй предлагают
  развернуть расположение, чтобы видеть вход, не оказываясь на одной
  линии с дверью."
  *Positive:* "С основного места для сидения виден вход в комнату."

- **FS-03 / FS-08 (no long-axis alignment with door):**
  *Warning:* "Длинная ось кровати / дивана / стола выровнена с дверным
  проёмом. В фэншуй обычно рекомендуют избегать такого выравнивания."

- **FS-04 (headboard on solid wall):**
  *Warning:* "Изголовье кровати стоит не у сплошной стены. По
  рекомендациям фэншуй лучше расположить изголовье у непрерывной стены."
  *Positive:* "Изголовье кровати у цельной стены."

- **FS-05 (bed not under window):**
  *Warning:* "Кровать частично расположена под окном. Это одна из
  распространённых рекомендаций в современной популярной литературе по
  фэншуй."

- **FS-07 (stove command position):**
  *Warning:* "Плита расположена спиной к двери кухни — не видно вход.
  По фэншуй это считается менее благоприятной позицией."

### 8.3 Phrasing NEVER to use

> "Так нельзя ставить кровать" — adversarial.
> "Это положение принесёт удачу / здоровье / богатство" — outcome
> guarantee.
> "Энергия Ци заблокирована" — mystical claim.
> "Финансовая энергия комнаты нарушена" — mystical claim.
> "Это грубая ошибка в планировке" — implies invalidity.

Tone: **recommendation**, not **diagnosis**. Always say "по фэншуй", never
"объективно", unless the same observation is *also* an ergonomic / safety
fact and the user can read both reasons in the finding.

---

## 9. Open Questions

These are explicitly out of scope for this Track E research but flagged so
the next track knows to decide them.

1. **What is the minimum solid wall length to count as "support"?** This is a
   Track A spatial-domain question. Suggested heuristic: ≥ entity back-side
   × 0.6.
2. **What is the angle band for "entrance directly aligned"?** Track A
   spatial-domain. Heuristic: ±10° off seat forward-axis at distance ≤ 3 m.
3. **Do we treat multi-room layouts (open-plan) as one room or several?**
   Architectural assumption, not a Feng Shui question.
4. **Do we tag the bed's headboard side on the asset, or derive it?** Asset
   metadata question; deferred.
5. **Which schools / modes should the user be able to toggle?** v1 ships
   with cross-school-consensus rules only. Mode toggles would be a v2
   feature, and §3.3 already documents the school taxonomy.
6. **Should a Feng Shui Rule Pack be a paid / opt-in / always-on feature?**
   Product decision; not Track E.

---

## 10. Sources

The canonical bibliography. The collaboration notes file
`docs/research/feng-shui/_sources.md` contains excerpts and methodological
notes.

### 10.1 Encyclopedic / academic

- **A.** Wikipedia, "Feng shui" (en). https://en.wikipedia.org/wiki/Feng_shui
  Retrieved 2026-08-23. School taxonomy (Form / Compass / BTB / Symbolic /
  Pierce), historical context, criticism. 36 scholarly citations including:
  - Bruun, Ole — *Fengshui in China: Geomantic Divination Between State
    Orthodoxy and Popular Religion* (NIAS Press, 2011; ISBN 978-87-91114-79-3)
    and *An Introduction to Feng Shui* (Cambridge University Press, 2008;
    ISBN 978-0-521-86352-0).
  - Skinner, Stephen — *Guide to the Feng Shui Compass: A Compendium of
    Classical Feng Shui* (Golden Hoard, 2008; ISBN 978-0-9547639-9-2).
  - Paton, Michael John — *Five Classics of Fengshui: Chinese Spiritual
    Geography in Historical and Environmental Perspective* (Brill, 2013;
    ISBN 978-90-04-24986-8).
  - Allan, Sarah — *The Shape of the Turtle: Myth, Art, and Cosmos in Early
    China* (SUNY Press, 1991).
  - Magli, Giulio — *Sacred Landscapes of Imperial China: Astronomy, Feng
    Shui, and the Mandate of Heaven* (Springer Nature, 2020;
    ISBN 978-3-030-49324-0).
  - Vyse, Stuart — *Superstition: A Very Short Introduction* (Oxford
    University Press, 2020; ISBN 978-0-19-885360-2).
  - Wang, Aihe — *Cosmology and Political Culture in Early China*
    (Cambridge University Press, 2000).
  - Wheatley, Paul — *The Pivot of the Four Quarters: A Preliminary Enquiry
    Into the Nature and Concepts of the Early Chinese City* (Aldine, 1971).

- **B.** Wikipedia, "Hong Kong Disneyland".
  https://en.wikipedia.org/wiki/Hong_Kong_Disneyland
  Retrieved 2026-08-23. Documents the 2005 walkway reconfiguration as a
  practitioner-driven design decision.

### 10.2 Traditional / practitioner

- **C.** Lillian Too / WoFS (World of Feng Shui).
  *Designing the Feng Shui of Bedrooms* by Chris Yeo, hosted on
  https://www.wofs.com/landscape-feng-shui/designing-the-feng-shui-of-bedrooms/
  Retrieved 2026-08-23. Used for: confirmation that practitioner literature
  (200+ books, 30+ languages per Source E) engages with bedroom-level
  layout recommendations.

- **D.** Jon Sandifer / Learn Feng Shui.
  https://www.learnfengshui.co.uk/ (course description)
  Retrieved 2026-08-23. Practitioner description of Form School's
  foundational emphasis on "what surrounds your home or business property
  to support it." 34 years of practice, 11 books.

- **E.** Wikipedia, "Lillian Too".
  https://en.wikipedia.org/wiki/Lillian_Too
  Retrieved 2026-08-23. Used for background on the credibility and reach
  of the Lillian Too publication channel.

### 10.3 Foundational context

- **F.** Wikipedia, "Bagua".
  https://en.wikipedia.org/wiki/Bagua
  Retrieved 2026-08-23. Trigrams, yin/yang correspondence in feng shui.
- **G.** Wikipedia, "Qi".
  https://en.wikipedia.org/wiki/Qi
  Retrieved 2026-08-23. Confirms qi "is a prescientific... pseudoscientific
  concept, i.e. not corresponding to the concept of energy as used in the
  physical sciences."

### 10.4 Skeptical / critical

- **H.** Stuart Vyse — *Superstition: A Very Short Introduction* (OUP,
  2020). Cited via Source A.
  Primary academic skeptical book. Treats feng shui as a superstition in
  the behavioral-psychology sense; explicitly notes that the practitioner
  literature may help people with a sense of control, but the underlying
  efficacy claim is unproven.
- **I.** Robert T. Carroll — *The Skeptic Encyclopedia of Pseudoscience*
  (ABC-CLIO, 2002). Cited via Source A. Frames feng shui as a
  New-Age / interior-decorating fad.

### 10.5 Practitioner-side corroboration (post-research extension)

- **K.** FengShuied (practitioner "Ed", Singapore). Site operational
  since 2003, practicing form-school + flying star + Eight Mansions
  with Bazi credentials. Cited specifically:
  - *What Is The Command Position In Feng Shui* (May 2019, updated Jan
    2026).
    https://www.fengshuied.com/command-position
    Verified 2026-08-23. Explicitly: *"The command position is one of
    the positioning concepts… sometimes known as the armchair position,
    it is an orientation theory that is associated with form school
    feng shui and has little connotations with compass school feng
    shui."* Enumerates six criteria: open spaces both sides; backing
    support; open spaces in front; no other comparable command
    positions; not in line with doors; not under a beam. Anchors
    FS-01 / FS-02 / FS-03 / FS-07 by cross-referencing the practitioner
    terminology.
  - *5 Feng Shui Bed Placement Rules That Apply To All Rooms* (Dec 2018).
    https://www.fengshuied.com/bed-placement
    Verified 2026-08-23. Contains the explicit coffin-position
    statement: "It is most harmful to have a door situated in front of the
    bed, where the feet (in sleeping position) points. This is famously
    known as the 'coffin' position as undertakers transport the dead
    leading with the feet. Many homeowners think that they have this
    feng shui predicament at home as long as the bed is in view when the
    bedroom door is opened. This is not the case as explained above.
    This problem is only present when a door is directly in front of the
    feet of the bed."
    Same source also explicitly endorses rule (1) "No windows behind bed
    head and in front of bed" and rule (2) "No overhanging beams above
    the bed" — both consistent with FS-05 and the deferred beam rule.
  - *Feng Shui Remedies For Various Bed Afflictions* (Feb 2022).
    https://www.fengshuied.com/bed-position-remedy
    Verified 2026-08-23. Restates coffin position with Chinese cultural
    context.
  - *Implications Of Doors Aligned In A Straight Line* (date not visible
    in extract).
    https://www.fengshuied.com/doors-in-a-line
    Verified 2026-08-23. Sha qi mechanism across straight sightlines.
  - *5 Ways To Remedy The Door Facing Door Feng Shui Problem* (Jan 2020).
      https://www.fengshuied.com/door-facing-door
      Verified 2026-08-23. Uses Chinese term 鬥口煞 (dou ko sha,
      "confrontational-mouth sha").
    - *The Rules Of Fireplace Feng Shui* (Jul 2019).
      https://www.fengshuied.com/fireplace-feng-shui
      Verified 2026-08-23. Establishes the practitioner convention of
      treating the kitchen stove and the fireplace as the same class of
      fire-element fixture — therefore the command-position rule that
      applies to fire fixtures applies to the stove. Anchors FS-07.
  - **Caveat:** All four FengShuied pages are the same practitioner.
    Independence net across the entire bibliography: one credible
    practitioner entity (FengShuied, Singapore) + one credible pro
    publisher (WOFS Lillian Too) + one credible Form-school teacher
    (Sandifer) + the academic citation chain from Source A — independence
    is well-met at the *rule* level (cross-school-consensus) but
    practitioner-side attribution is concentrated.

### 10.6 Practitioner-side corroboration — modern Western practitioner (Source L)

- **L.** Karen Rauch Carter (KRC), professional member of the
  International Feng Shui Guild, Certified Bau-Biologie Practitioner,
  best-selling author of *Move Your Stuff, Change Your Life* (Riverhead,
  Penguin Random House). Site: https://karenrauchcarter.com/
  Verified 2026-08-23 — credentials stated on her own About page.
  Specifically:
  - Bedroom tips post (verified):
    https://karenrauchcarter.com/feng-shui-tips-for-the-bedroom-for-health-and-relationship-improvements/
    Contains verbatim her bedroom rule #8: *"Create a headboard for the
    bed and place it against the most solid wall in the room – cure
    poison arrows or 'bed in line with doorway' lines by hanging a
    crystal between the bed and the negative item."*
    This directly anchors FS-04 (headboard on solid wall) and explicitly
    cross-references "bed in line with doorway", which is the same
    geometric predicate as FS-03.
  - "Is Your Bed in Line With the Door? Here's a Feng Shui Tip to
    Protect Your Health" post (July 29, 2024, verified):
    https://karenrauchcarter.com/is-your-bed-in-line-with-the-door-heres-a-feng-shui-tip-to-protect-your-health/
    Direct practitioner framing of bed/door alignment, with KRC's
    discussion of surrounding-walls.
  - KRC also confirms the three-severity BTB-side distinction
    (back-to-door vs perpendicular-and-can't-see vs directly-in-line).
- **Caveat:** KRC's school affiliation is partly modern / BTB-aligned
  rather than classical Form — same caveat as Source K. KRC's
  formulation of "support behind" / "bed in line with doorway" provides
  *modern-popular corroboration* of the same recommendation that
  FengShuied (Source K) and the classical Form School describe in
  different wording.

### 10.7 Sources consulted but not cited

- **TheSpruce, House Beautiful, Real Simple, BHG, Good Housekeeping,
  Architectural Digest, SFGate, WikiHow** — attempted, blocked or
  unarchived at time of research.
- **Reddit r/FengShui, Stack Exchange Interiors** — blocked at time of
  research.
- **rsmei heritage / Asian Art Museum essay** — SSL verification failed.
- **BTB.fengshui.com** — DNS unavailable from this host at research time.
- **Pinterest captions, AI-blog listicles, affiliate furniture blogs** —
  not consulted per brief instructions.

### 10.8 Important disagreements noted

- **Form vs. Compass School**: Form Branch (classical, environmental shape)
  and Compass Branch (Kua numbers, Eight Mansions) are internally
  consistent but disagree about whether the *spatial* recommendations are
  sufficient. Compass Branch typically requires occupant Kua-number data
  for some rulings. Our v1 keeps only Form-broad / popular spatial rules
  precisely so it can avoid persona data.
- **BTB / Black Sect vs. classical**: the "commanding position" phrasing
  is most strongly attested in the modern BTB lineage, which is itself
  Wikipedia-categorised as "Westernised or modern methods not based on
  Classical teachings." We mark FS-02's confidence accordingly
  (MEDIUM-HIGH rather than HIGH).
- **Bed under window** (FS-05): modern popular practitioner source
  prominence vs. thin classical attestation. Recorded in §4.5.
- **Mirror facing bed**: a popular-practitioner recommendation with no
  clear Form-School classical attestation. Out of scope for v1 because
  mirror is not a first-class furniture entity.
- **Penn & Teller / Robert T. Carroll / Stuart Vyse** all note that
  practitioner disagreements are common — the same room can produce
  different recommendations from different practitioners. We acknowledge
  this in §3 and recommend that the product communicate findings as
  *one* traditional perspective, not *the* Feng Shui answer.

### 10.9 Chinese-term glossary (for traceable paraphrase only)

The product never surfaces these terms to the user. They appear here for
research-trail purposes so reviewers can verify our paraphrase against
traditional terms.

- **棺材位 (guān cái wèi)** — literally "coffin position." The bed's
  long-axis points at a door with the door at the *foot* end of the bed.
  Used in Source K.
- **棺材煞 (guān cái shà)** — literally "coffin affliction." Same
  phenomenon, sha-style framing. Source K uses both forms.
- **鬥口煞 (dòu kǒu shà)** — literally "confrontational-mouth sha."
  Door-versus-door sha qi, two doors facing each other across a room or
  corridor. Source K.
- **煞氣 (shà qì)** / **煞 (shà)** — "killing breath" / "poison
  breath." The motivating mechanism used by Form School for several of
  our rules. We do not use this term in product-facing copy.
- **形勢派 / 巒頭派 (xíng shì pài / luán tóu pài)** — Form School of
  Feng Shui. Source A.
- **理氣派 (lǐ qì pài)** — Compass School. Source A.
- **BTB 玄空 (Black Hat Tantric Buddhism lineage)** — Source A.

---

## 11. Recommended v1 rule pack

The five-to-eight rules for **INCLUDE V1**:

| Rule ID                                  | Short name                              | Confidence  | Spatial facts                            | Difficulty |
|------------------------------------------|-----------------------------------------|-------------|------------------------------------------|------------|
| feng-shui.seating-support-behind         | Support behind primary seating          | HIGH        | forward axis, rear wall, window flag     | LOW        |
| feng-shui.command-position               | Command position (entrance in view)     | MEDIUM-HIGH | forward axis, door vector, angle, dist.  | MEDIUM     |
| feng-shui.no-direct-alignment-with-door  | No direct alignment of bed/desk with door | **HIGH**  | entity long-axis, door vector, distance  | LOW        |
| feng-shui.bed-headboard-support          | Bed: headboard against solid wall       | MEDIUM-HIGH | headboard-side, wall segment              | MEDIUM     |
| feng-shui.bed-not-under-window           | Bed not under window                    | LOW-MEDIUM  | bed footprint, window entities            | MEDIUM     |
| feng-shui.desk-command-position          | Desk in command position                | MEDIUM-HIGH | forward axis, entrance wall, distance    | LOW        |

**Recommended order of implementation:**

1. **FS-01** + **FS-03** + **FS-08** — cheapest facts, available from the TV
 planner's existing spatial vocabulary. Two-facts predicate (entity
 forward axis + nearest wall behind / nearest door). Implement first.
2. **FS-02** — extends the same facts with entrance identification, which
 already exists in Track A's spatial vocabulary for room-by-entrance
 mapping. Implement second.
3. **FS-04** — adds headboard-side tagging. Asset-domain work for
 `FurnitureAssetDefinition` to optionally tag a "headboardSide" axis.
 Low priority *only* if the asset model is not extended; otherwise,
 close to trivial.
4. **FS-06** — same predicates as FS-02 but applied to desk, free if
 FS-02 is implemented first.
5. **FS-05** — requires window entities. Last priority because window is
 not yet a first-class entity in Track A's planned future state.

**FS-07** (kitchen stove) is deferred in this track's *implementation*
priority but kept in the matrix for completeness; the deterministic
planner's first orientation is TV / living-room, not kitchen.

## 12. Quick research-quality checklist

- [x] Multiple independent credible sources used (Wikipedia + Lillian Too +
    Sandifer + 36-citation academic chain).
- [x] No rule depends solely on one SEO blog.
- [x] School / tradition differences recorded explicitly (Form / Compass
    / BTB / Symbolic).
- [x] Unsupported outcome claims removed (no "guaranteed" wording in
    §8 product phrasing).
- [x] Objective ergonomics not mislabeled as Feng Shui (overlap ownership
    discussion in §7).
- [x] Geometry implementation not invented (predicate descriptions only;
    thresholds marked TBD).
- [x] All INCLUDE V1 rules have explicit required spatial facts (§6).
- [x] All INCLUDE V1 rules can map conceptually to PlanningFinding (§4 per
    rule + §11).
- [x] Citations / links preserved (§10).
