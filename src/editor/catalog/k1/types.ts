// src/editor/catalog/k1/types.ts
//
// K1 — Production Asset Spatial Truth (Amended v3 — facts/evidence split).
//
// Two namespaces live in this file:
//
//   `FACTS`      durable spatial meaning. No hashes. No QA verdicts.
//                Committed in production-asset-facts-v1.json.
//
//   `EVIDENCE`   hash-bearing metadata. Committed in
//                production-asset-spatial-evidence-v1.json (non-binary ledger;
//                binaries stay local under .agent-data/k1-production-assets/).
//
// `semanticRole` lives ONLY on Production Selection
// (`src/editor/catalog/data/production-catalog-v1.json`); it MUST NOT appear
// on K1 facts (no duplication).
//
// K2 (not K1) mints `assetRevisionId`. K1 binds evidence by SHA256 only.
//
// No runtime code here — types only. No side-effect imports.

// ============================================================================
// Shared primitives
// ============================================================================

export type PlacementAnchor = 'floor' | 'wall' | 'surface' | 'ceiling';
export type EditorPlacementSupport = 'supported' | 'unsupported';
export type PlacementStatus = 'resolved' | 'ambiguous';
export type FootprintPolicy =
  | 'full-xz-envelope'
  | 'full-xz-envelope-tv-wall'
  | 'lower-band-review';

// ============================================================================
// FACTS namespace — durable spatial meaning. No hashes. No QA verdicts.
// ============================================================================

export namespace FACTS {
  /** Foreign key into the frozen Production Selection (`production-catalog-v1.json`). */
  export type AssetId = string;

  /** Per-axis dimensions in meters, finite, > 0. */
  export interface Dimensions {
    width: number;
    height: number;
    depth: number;
  }

  /** Per-asset ground-plane occupancy envelope (XZ-only footprint). */
  export interface Footprint {
    width: number;          // meters, finite, > 0
    depth: number;          // meters, finite, > 0
    policy: FootprintPolicy;
  }

  /**
   * Placement classification.
   *
   * `anchor === null` is ONLY valid when `status === 'ambiguous'`. K1 never
   * fabricates `anchor: 'floor'` for an unresolved asset (Plan A10 / v3 #2).
   * `editorPlacementSupport` is independent of `anchor`: a wall asset may be
   * `anchor: 'wall'` + `editorPlacementSupport: 'unsupported'` (placement
   * engine cannot place walls as of K1).
   */
  export interface Placement {
    anchor: PlacementAnchor | null;
    status: PlacementStatus;
    editorPlacementSupport: EditorPlacementSupport;
  }

  /**
   * Single asset's spatial facts. The committed facts artifact is an array
   * of these records, sorted by `assetId`.
   */
  export interface K1AssetFacts {
    assetId: AssetId;
    dimensions: Dimensions;
    footprint: Footprint;
    placement: Placement;
    /** Frozen — see ADR `docs/adr/production-asset-coordinate-contract-k1.md` §2.1. */
    canonicalForward: '+Z';
  }

  /**
   * Top-level committed facts artifact. Lives in
   * `src/editor/catalog/data/production-asset-facts-v1.json`.
   */
  export interface K1FactsArtifact {
    schemaVersion: 1;
    coordinateContractVersion: 1;
    /** K1_BASE_SHA at execution time (gitignored `.agent-data/.../logs/k1-base-sha.txt`). */
    k1BaseSha: string;
    /** Frozen catalog base SHA (post-merge of PR #21). */
    trackBaseSha: string;
    /** sha256 of `production-catalog-v1.json` bytes (frozen selection integrity). */
    frozenSelectionSha256: string;
    assetCount: 47;
    /** Counts only resolved anchors; ambiguous assets are NOT counted in `byAnchor`. */
    byAnchor: Record<PlacementAnchor, number>;
    /** Count of `status === 'ambiguous'` entries. */
    byAmbiguousCount: number;
    byPolicy: Record<FootprintPolicy, number>;
    byEditorPlacementSupport: Record<EditorPlacementSupport, number>;
    /** sha256 of `production-asset-spatial-evidence-v1.json` bytes — binds facts to ledger. */
    evidenceLedgerSha256: string;
    /** Sorted by `assetId`. */
    assets: K1AssetFacts[];
  }
}

// ============================================================================
// EVIDENCE namespace — hash-bearing, transform/QA metadata. Non-binary.
// ============================================================================

export namespace EVIDENCE {
  export type AssetId = string;

  /** What the source GLB appears to face in its local frame. Populated only by RAW visual review. */
  export type ForwardApparentAxis = '+X' | '-X' | '+Z' | '-Z' | 'ambiguous';

  /** Verdict from a visual review (RAW or CANONICAL pass). */
  export type VisualQaVerdict = 'pass' | 'fail' | 'unsupported';

  /**
   * Summary key for `byCanonicalVisualQa`. **Always** one of these four — never
   * the literal string `"null"` (Plan guardrail #3). `notApplicable` covers the
   * case where canonicalization was NOT applied (canonicalSha256 === null).
   */
  export type CanonicalQaSummaryKey = 'pass' | 'fail' | 'unsupported' | 'notApplicable';

  /**
   * Numeric tolerances (meters). See ADR §5.
   *  - DIMENSION_EPSILON_M     = 0.01  (1 cm)
   *  - FOOTPRINT_EPSILON_M     = 0.02  (2 cm; reserved for footprint equality checks)
   *  - FLOOR_CONTACT_EPSILON_M = 0.005 (5 mm)
   *  - ORIGIN_EPSILON_M        = 0.005 (5 mm)
   */
  export type Epsilon = number;

  /** Axis-aligned bounding box in 3D. */
  export interface Box3Like {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  }

  /**
   * Transform applied during canonicalization. `null` on entries where
   * canonicalization was NOT applied (e.g. `forwardApparentAxis === 'ambiguous'`).
   *
   * Translation order (guardrail #1):
   *   1. Apply `rotationCorrectionRadians` to the source scene.
   *   2. `scene.updateMatrixWorld(true)`.
   *   3. Re-measure Box3 from the ROTATED scene.
   *   4. Compute midpointX/midpointZ/minY from POST-rotation Box3.
   *   5. Translate by `(-midpointX, -minY, -midpointZ)`.
   * Never translate to `Box3.min → (0, 0, 0)`.
   */
  export interface K1EvidenceTransform {
    rotationCorrectionRadians: number;
    translationApplied: { x: number; y: number; z: number };
    /** Canonical scale is 1.0 — K1 does not introduce arbitrary scale correction. */
    scaleApplied: 1;
    sourceBox3: Box3Like;
    canonicalBox3: Box3Like;
    /**
     * Outcome of the canonical-origin assertions (Plan v3 #1).
     * `floorContactForFloorAssets` uses the symmetric abs() check for floor
     * assets and is `'not-applicable'` for non-floor assets (e.g. wall-mounted
     * TVs once the wall contract is defined in Commit 2).
     */
    measurementAssertions: {
      /** `|canonicalBox3.midpoint.x| <= ORIGIN_EPSILON_M` */
      midpointXAtOrigin: 'pass' | 'fail';
      /** `|canonicalBox3.midpoint.z| <= ORIGIN_EPSILON_M` */
      midpointZAtOrigin: 'pass' | 'fail';
      /** `abs(canonicalBox3.min.y) <= FLOOR_CONTACT_EPSILON_M` for floor assets; `'not-applicable'` for non-floor. */
      floorContactForFloorAssets: 'pass' | 'fail' | 'not-applicable';
    };
  }

  /**
   * Single asset's evidence record. One entry per `assetId` in the committed
   * ledger. `null` fields encode "not applied yet" or "not classified"; the
   * deep-scan test confirms those nulls are NOT replaced by string `"null"`.
   */
  export interface K1AssetEvidence {
    assetId: AssetId;
    /** SHA256 of source GLB bytes (64 hex chars). */
    sourceSha256: string;
    /** SHA256 of canonical GLB bytes (64 hex chars) or `null` if canonicalization was not applied. */
    canonicalSha256: string | null;
    /** What the source GLB appears to face; populated only by RAW visual review. */
    sourceApparentForwardAxis: ForwardApparentAxis;
    /** Transform applied during canonicalization; `null` iff `canonicalSha256 === null`. */
    transform: K1EvidenceTransform | null;
    /** Verdict from RAW visual QA on the source GLB. */
    rawVisualQa: VisualQaVerdict;
    /** SHA256 of the matching row in `k1-visual-qa-raw.json` (local-only). */
    rawVisualQaRowSha256: string;
    /** Verdict from CANONICAL visual QA on the canonical derivative; `null` if no canonical QA. */
    canonicalVisualQa: VisualQaVerdict | null;
    /** SHA256 of the matching row in `k1-visual-qa-canonical.json` or `null`. */
    canonicalVisualQaRowSha256: string | null;
    /**
     * Free-form note. **Only on the evidence ledger** (never on facts —
     * guardrail #2). Required when `rawVisualQa === 'unsupported'` or
     * `canonicalVisualQa === 'unsupported'`, per `tests/catalog/k1-visual-qa-evidence.test.mjs`.
     */
    notes?: string;
  }

  /**
   * Top-level committed evidence ledger. Lives in
   * `src/editor/catalog/data/production-asset-spatial-evidence-v1.json`.
   *
   * `byCanonicalVisualQa` uses the explicit `'notApplicable'` key (never
   * the literal string `"null"`) for entries where canonicalization was
   * NOT applied.
   */
  export interface K1EvidenceLedger {
    schemaVersion: 1;
    coordinateContractVersion: 1;
    k1BaseSha: string;
    trackBaseSha: string;
    assetCount: 47;
    byRawVisualQa: Record<VisualQaVerdict, number>;
    byCanonicalVisualQa: Record<CanonicalQaSummaryKey, number>;
    /** Sorted by `assetId`. */
    entries: K1AssetEvidence[];
  }
}
