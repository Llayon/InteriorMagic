import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_FILES = [
  { path: 'model.glb', contentType: 'model/gltf-binary' },
  { path: 'model.usdz', contentType: 'model/vnd.usdz+zip' },
  { path: 'poster.webp', contentType: 'image/webp' },
  { path: 'manifest.json', contentType: 'application/json; charset=utf-8' },
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const loadValidatedReleaseObjects = async (revisionRoot) => {
  const checksumsPath = path.join(revisionRoot, 'checksums.json');
  const checksumsBytes = await readFile(checksumsPath);
  let checksums;
  try {
    checksums = JSON.parse(checksumsBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`AR0 checksums.json is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (checksums?.schemaVersion !== 1 || checksums.assetRevisionId !== 'sheen-chair-r1' || !Array.isArray(checksums.files)) {
    throw new Error('AR0 checksums.json does not match sheen-chair-r1');
  }
  if (checksums.files.length !== EXPECTED_FILES.length) throw new Error('AR0 checksums.json has an unexpected file set');

  const objects = [];
  for (const expected of EXPECTED_FILES) {
    const record = checksums.files.find((entry) => entry?.path === expected.path);
    if (!record || typeof record.bytes !== 'number' || typeof record.sha256 !== 'string' || record.contentType !== expected.contentType) {
      throw new Error(`AR0 checksums record is invalid for ${expected.path}`);
    }
    const localFile = path.join(revisionRoot, expected.path);
    const bytes = await readFile(localFile);
    const actualSha256 = sha256(bytes);
    if (bytes.length !== record.bytes || actualSha256 !== record.sha256) {
      throw new Error(`AR0 local artifact does not match checksums.json: ${expected.path}`);
    }
    objects.push({ ...record, localFile });
  }

  objects.push({
    path: 'checksums.json',
    bytes: checksumsBytes.length,
    sha256: sha256(checksumsBytes),
    contentType: 'application/json; charset=utf-8',
    localFile: checksumsPath,
  });
  return { checksumsBytes, checksums, objects };
};
