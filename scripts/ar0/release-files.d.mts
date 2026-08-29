export interface ReleaseObject {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
  localFile: string;
}

export function loadValidatedReleaseObjects(revisionRoot: string, expectedRevisionId?: string): Promise<{
  checksumsBytes: Buffer;
  checksums: unknown;
  objects: ReleaseObject[];
}>;
