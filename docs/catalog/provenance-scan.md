# Production Catalog v1 — Provenance Scan

**Repo scan root:** `D:\Programms\Max\InteriorMagic\.worktrees\production-catalog-v1`
**Files scanned:** 199 text files (`*.md|json|csv|ts|mjs|js|txt`, ≤1 MB).
**Searched keywords:** ITHappy + {license, CC0, attribution, public domain, permitted use, provenance, upstream}.

## Verdict

**ITHappy per-asset license ledger: NOT_FOUND.**

No co-occurrence of "ithappy" with license/provenance terms in repo.


## Searched locations

- `THIRD_PARTY_ASSETS.md` — repository-level license ledger for Sheen Chair (CC0-1.0) and Kenney Furniture Kit (CC0 1.0). Does NOT cover ITHappy.
- `R2_ASSET_DELIVERY.md` — release + checksums process for ITHappy; does NOT establish per-asset license.
- `ASSET_AUDIT.md` — per-asset runtime measurements; not a license record.
- `docs/`` — project docs (adr/, qa/, research/); no ITHappy license ADR found.
- `scripts/research/retail/` — Track F retail research; no ITHappy license record found.
- Upstream ITHappy pipeline reports under `.agent-data/ithappy-production-pipeline/reports/` and `.agent-data/ithappy-catalog-build/reports/` — operational metrics, not license records.

## Reference-only license summary (read from existing repo docs)

- Sheen Chair (KhronosGroup glTF Sample Assets): CC0-1.0 documented in `THIRD_PARTY_ASSETS.md` — verified: YES
- Kenney Furniture Kit: CC0 1.0 documented in `THIRD_PARTY_ASSETS.md` — verified: YES
- 6 prototype SVG-stub entries in `src/editor/assets/registry.ts`: provenance NOT documented; treated as `needs_provenance` and excluded from Production Pack.

## Implication for Track I

A11: missing ITHappy license evidence is reported as a production blocker, NOT a STOP. Cycle continues.

The Production Pack curation proceeds. The final report (I-RPT.1) will explicitly call out that the legal gate remains unresolved and that activation should be deferred until per-asset license records are added (likely via an upstream ingestion ADR).

## R2 release content (read from R2_ASSET_DELIVERY.md)

```text
Release `v1` maps to:

```
```
