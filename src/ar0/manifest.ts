import type { Ar0RevisionDefinition } from './revisions';

export interface Ar0ManifestFile {
  readonly path: string;
  readonly sha256: string;
}

export interface Ar0RuntimeManifest {
  readonly schemaVersion: 2;
  readonly arRevisionId: string;
  readonly assetId: string;
  readonly spatial: {
    readonly dimensionsMeters: {
      readonly width: number;
      readonly height: number;
      readonly depth: number;
    };
    readonly placementAnchor: 'floor';
  };
  readonly ar: {
    readonly scale: 'fixed';
    readonly placement: 'floor';
  };
  readonly files: {
    readonly glb: Ar0ManifestFile;
    readonly usdz: Ar0ManifestFile;
    readonly poster: Ar0ManifestFile;
  };
}

const isManifestFile = (value: unknown, expectedPath: string): value is Ar0ManifestFile => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.path === expectedPath && typeof candidate.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(candidate.sha256);
};

export const parseAr0Manifest = (value: unknown, revision: Ar0RevisionDefinition): Ar0RuntimeManifest => {
  if (!value || typeof value !== 'object') throw new Error('AR revision manifest is not an object');
  const candidate = value as Record<string, unknown>;
  const files = candidate.files as Record<string, unknown> | undefined;
  const spatial = candidate.spatial as Record<string, unknown> | undefined;
  const dimensions = spatial?.dimensionsMeters as Record<string, unknown> | undefined;
  const ar = candidate.ar as Record<string, unknown> | undefined;
  const dimensionsValid = dimensions
    && ['width', 'height', 'depth'].every((axis) => Number.isFinite(dimensions[axis]) && Number(dimensions[axis]) > 0);
  if (
    candidate.schemaVersion !== 2
    || candidate.arRevisionId !== revision.arRevisionId
    || candidate.assetId !== revision.assetId
    || !dimensionsValid
    || spatial?.placementAnchor !== 'floor'
    || ar?.scale !== 'fixed'
    || ar?.placement !== 'floor'
    || !files
    || !isManifestFile(files.glb, 'model.glb')
    || !isManifestFile(files.usdz, 'model.usdz')
    || !isManifestFile(files.poster, 'poster.webp')
  ) throw new Error('AR revision manifest does not match its immutable revision');
  return candidate as unknown as Ar0RuntimeManifest;
};
