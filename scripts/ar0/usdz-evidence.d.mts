export const AR0_REVISION_ID: 'sheen-chair-r1';

export interface UsdzEvidenceExpectation {
  assetRevisionId: string;
  usdzSha256: string;
  glbSize: readonly number[];
}

export function validateUsdzEvidence(evidence: unknown, expected: UsdzEvidenceExpectation): {
  schemaVersion: 1;
  assetRevisionId: string;
  usdzSha256: string;
  parser: string;
  upAxis: 'Y';
  metersPerUnit: 1;
  stageBounds: { min: number[]; max: number[]; sizeMeters: number[]; [key: string]: unknown };
  dependencies: { unresolved: string[]; [key: string]: unknown };
  [key: string]: unknown;
};
