// src/editor/catalog/k1/types.ts
//
// K1 — Production Asset Spatial Truth.
//
// Two namespaces describe the two committed JSON artifacts:
//
//   FACTS     src/editor/catalog/data/production-asset-facts-v1.json
//             Durable spatial meaning. No hashes. No QA verdicts.
//
//   EVIDENCE  src/editor/catalog/data/production-asset-spatial-evidence-v1.json
//             Hash-bearing metadata: source/canonical sha256, transforms,
//             measurement assertions (writer + independent GLTFLoader),
//             orientation assertions, RAW + canonical visual QA verdict,
//             semanticMismatch flag.
//
// K1 owns neither the frozen Production Selection
// (`src/editor/catalog/data/production-catalog-v1.json`) nor the placement
// engine / planner. K1 only ATTESTS spatial truth for each asset.
//
// K2 (not K1) mints `assetRevisionId`. K1 binds evidence by SHA256 only.

export type PlacementAnchor = 'floor' | 'wall' | 'surface' | 'ceiling';
export type EditorPlacementSupport = 'supported' | 'unsupported';
export type PlacementStatus = 'resolved' | 'ambiguous' | 'unsupported';
export type FootprintPolicy =
  | 'full-xz-envelope'
  | 'full-xz-envelope-tv-wall'
  | 'lower-band-review';
export type ForwardApparentAxis = '+X' | '-X' | '+Z' | '-Z' | 'ambiguous';
export type VisualQaVerdict = 'pass' | 'fail' | 'unsupported';
export type K1SpatialStatus = 'pass' | 'blocked';

// ----------------------------------------------------------------------------
// FACTS — durable spatial meaning.
// ----------------------------------------------------------------------------

export namespace FACTS {
  /** Foreign key into the frozen Production Selection. */
  export type AssetId = string;

  export interface Dimensions {
    width: number;   // meters, finite, > 0
    height: number;  // meters, finite, > 0
    depth: number;   // meters, finite, > 0
  }

  export interface Footprint {
    width: number;   // meters, finite, > 0
    depth: number;   // meters, finite, > 0
    policy: FootprintPolicy;
  }

  /**
   * Placement classification.
   *
   * `anchor === null` is ONLY valid when `status === 'ambiguous'` or
   * `status === 'unsupported'`. K1 never fabricates `anchor: 'floor'` for an
   * unresolved asset.
   */
  export interface Placement {
    anchor: PlacementAnchor | null;
    status: PlacementStatus;
    editorPlacementSupport: EditorPlacementSupport;
  }

  export interface K1AssetFacts {
    assetId: AssetId;
    dimensions: Dimensions;
    footprint: Footprint;
    placement: Placement;
    canonicalForward: '+Z';
  }

  export interface K1FactsArtifact {
    schemaVersion: 1;
    coordinateContractVersion: 1;
    k1BaseSha: string;
    trackBaseSha: string;
    frozenSelectionSha256: string;
    assetCount: 47;
    byAnchor: Partial<Record<PlacementAnchor, number>>;
    byPolicy: Record<FootprintPolicy, number>;
    byEditorPlacementSupport: Record<EditorPlacementSupport, number>;
    byStatus: Record<PlacementStatus, number>;
    evidenceLedgerSha256: string;
    assets: K1AssetFacts[];
  }
}

// ----------------------------------------------------------------------------
// EVIDENCE — non-binary ledger, hash-bearing.
// ----------------------------------------------------------------------------

export namespace EVIDENCE {
  export type AssetId = string;

  export interface Translation {
    x: number;
    y: number;
    z: number;
  }

  export interface AppliedTransform {
    rotationCorrectionRadians: number;
    rotationAxis: '+Y';
    translationApplied: Translation;
    scaleApplied: 1;
  }

  export interface IndependentMeasurement {
    dimensions: { width: number; height: number; depth: number };
    midpointX: number;
    midpointZ: number;
    minY: number;
  }

  export interface OrientationAssertions {
    upInvariant: boolean;
    forwardAsserted: boolean | 'notApplicable';
    axis: ForwardApparentAxis;
  }

  /**
   * Per-axis assertions recorded by the canonical writer + the independent
   * GLTFLoader verifier. ALL must be 'pass' (or 'notApplicable' where
   * documented) for the asset to be considered spatially authoritative.
   */
  export interface MeasurementAssertions {
    midpointXAtOrigin: 'pass' | 'fail';
    midpointZAtOrigin: 'pass' | 'fail';
    floorContactForFloorAssets: 'pass' | 'fail';
    dimensionsPreserved: 'pass' | 'fail';
    independentMidpointXAtOrigin: 'pass' | 'fail';
    independentMidpointZAtOrigin: 'pass' | 'fail';
    independentFloorContact: 'pass' | 'fail';
    orientationUpInvariant: 'pass' | 'fail';
    orientationForwardAsserted: 'pass' | 'notApplicable' | 'fail';
  }

  export interface K1EvidenceEntry {
    assetId: AssetId;
    sourceSha256: string;
    canonicalSha256: string | null;
    sourceApparentForwardAxis: ForwardApparentAxis;
    appliedTransform: AppliedTransform;
    measurementAssertions: MeasurementAssertions;
    independentMeasurement: IndependentMeasurement;
    orientationAssertions: OrientationAssertions;
    rawVisualQa: VisualQaVerdict;
    canonicalVisualQa: 'pass' | 'fail';
    semanticMismatch: boolean;
    /**
     * Narrow K1 status: 'pass' = spatial truth authoritative (canonical
     * geometry + identity + materials preserved, RAW QA pass). 'blocked'
     * if semanticMismatch=true OR canonicalVisualQa != 'pass'. This is
     * NOT a production-eligibility verdict (rights, assetRevisionId,
     * delivery are out of K1 scope).
     */
    k1SpatialStatus: K1SpatialStatus;
    notes: string;
  }

  export interface K1EvidenceArtifact {
    schemaVersion: 1;
    coordinateContractVersion: 1;
    k1BaseSha: string;
    trackBaseSha: string;
    frozenSelectionSha256: string;
    assetCount: number;
    byRawVisualQa: {
      pass: number;
      fail: number;
      unsupported: number;
    };
    byCanonicalVisualQa: {
      pass: number;
      fail: number;
      notApplicable: number;
      unsupported?: number;
    };
    bySemanticMismatch: number;
    entries: K1EvidenceEntry[];
  }
}
