# Feng Shui Rule Matrix v1

> Concise implementation-oriented matrix for the recommended Feng Shui v1
> Rule Pack. See `feng-shui-rule-research-v1.md` for full context.

## Recommended v1 rules

| Rule ID                                      | Short name                                | Room                | Confidence  | Required spatial facts (CORE first)                                                                                                          | Difficulty | Decision      |
|----------------------------------------------|-------------------------------------------|---------------------|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------|------------|---------------|
| feng-shui.seating-support-behind             | Support behind primary seating            | living room, office | HIGH        | entity forward axis; nearest wall behind; distance to wall; window/door flag in rear                                                          | LOW        | INCLUDE V1    |
| feng-shui.command-position                   | Command position — entrance in view        | living room, office | MEDIUM-HIGH | entity forward axis; entrance position; distance to entrance; angle from forward axis to entrance                                            | MEDIUM     | INCLUDE V1    |
| feng-shui.no-direct-alignment-with-door      | No long-axis alignment with door           | bedroom, home office, living room | HIGH     | entity long axis; door vector; dot product / angle; distance to door                                                                          | LOW        | INCLUDE V1    |
| feng-shui.bed-headboard-support              | Bed headboard against solid wall          | bedroom             | MEDIUM-HIGH | headboard-side direction; nearest wall behind; window extent in that wall segment                                                            | MEDIUM     | INCLUDE V1    |
| feng-shui.bed-not-under-window               | Bed not under window                      | bedroom             | LOW-MEDIUM  | bed footprint; window entity footprints                                                                                                      | MEDIUM     | INCLUDE V1    |
| feng-shui.desk-command-position              | Desk in command position                  | home office         | MEDIUM-HIGH | forward axis; door vector; wall behind; same as command-position + seating-support-behind                                                   | LOW        | INCLUDE V1    |
| feng-shui.stove-command-position             | Stove cook not with back to door          | kitchen             | MEDIUM      | forward axis; door vector; window direction                                                                                                  | MEDIUM     | DEFER (Track A's kitchen scene first) |
| feng-shui.seating-not-aligned-with-door      | Sofa: not aligned with door / opening     | living room         | MEDIUM      | entity long axis; door vector; same as no-direct-alignment-with-door for sofa                                                                 | LOW        | INCLUDE V1 (re-uses FS-03 facts)      |

## Recommended implementation order

1. **Rules using facts already likely available from the TV planner (Track A's
   current vocabulary)**: `feng-shui.seating-support-behind`,
   `feng-shui.no-direct-alignment-with-door`,
   `feng-shui.seating-not-aligned-with-door`. Implement first; require only
   entity forward axis + nearest wall behind + door position.

2. **Rules needing one small reusable spatial fact (door → entrance mapping
   already exists)**: `feng-shui.command-position`,
   `feng-shui.desk-command-position`. Implement second; uses entrance
   identification (already on the spatial domain's roadmap).

3. **Rules requiring asset-level tagging or a new entity type**:
   - `feng-shui.bed-headboard-support` — needs `headboardSide` semantic on
     bed assets.
   - `feng-shui.bed-not-under-window` — needs `Window` as a first-class
     entity.

## Spatial fact inventory (CORE / SECONDARY / DEFER)

### CORE (needed by ≥3 v1 rules)

- entity forward orientation
- entity rear local direction (derived)
- nearest wall / structure behind entity
- distance to that wall
- entrance position
- angle from entity forward axis to entrance
- distance from entity to entrance
- direct-alignment test (long axis vs door vector)
- wall-segment solid length in a local direction

### SECONDARY (needed by 1–2 rules)

- headboard-side direction of bed
- window entities (position + footprint)
- overlap between bed footprint and window footprint
- stove forward axis (occupant forward axis)

### DEFER

- sharp-corner incidence angle (poison-arrow sub-rule, deferred)
- ceiling beam / overhead structure (deferred)
- mirror entities (deferred)
- sector grid (Bagua) — Compass-school, persona-bound, rejected

## Severity classification (research, not runtime)

| Rule        | Default severity — present        | Default severity — absent / violated |
|-------------|-----------------------------------|---------------------------------------|
| FS-01       | positive                          | warning                                |
| FS-02       | positive                          | info (out-of-view) / warning (aligned) |
| FS-03       | n/a (positive finding optional)   | warning                                |
| FS-04       | positive                          | warning                                |
| FS-05       | n/a                               | warning                                |
| FS-06       | positive                          | warning                                |
| FS-07       | positive                          | warning                                |
| FS-08       | n/a                               | warning                                |

(Final severity tuning is Track A / Track C work; this is research-side
classification only.)

## PlanningFinding mapping (concept)

```
{
  ruleId: 'feng-shui.seating-support-behind',
  code:    'unsupported-primary-seating',
  objectIds: ['sofa-1'],
  params: { distance: 1.4, supportType: 'none' },
  severity: 'warning',
  scoreImpact: ...    // Track A tunes.
}
```

(No actual contract edits. No new schema. Uses existing `PlanningFinding`
shape from planning-contract-v1.)

## Open questions (not blocking)

- What is the "minimum solid wall length" to count as support? Track A.
- What is the "entrance directly aligned" angle band? Track A.
- Bed headboard-side tag — added to FurnitureAssetDefinition? Track A.
- Window as first-class entity? Track A.

## Files

- `docs/research/feng-shui/feng-shui-rule-research-v1.md` — full research
  document.
- `docs/research/feng-shui/feng-shui-rule-matrix-v1.md` — this matrix.
- `docs/research/feng-shui/_sources.md` — working notes from
  source-extraction work.
- Raw fetched sources are kept locally under
  `.agent-data/feng-shui-research/sources/_raw/` (not committed to the
  repository).
