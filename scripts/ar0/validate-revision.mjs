import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { measureGlbFile, parseGlb } from './glb-bounds.mjs';
import { AR0_REVISION_ID, validateUsdzEvidence } from './usdz-evidence.mjs';

const root = process.cwd();
const staged = process.argv.includes('--staged');
const revisionRoot = staged
  ? path.join(root, 'public/ar0/sheen-chair/r1')
  : path.join(root, '.agent-data/ar0/sheen-chair-r1');
const stageEvidencePath = staged
  ? path.join(root, 'docs/ar/evidence/sheen-chair-r1/usdz-stage-report.json')
  : path.join(revisionRoot, 'usdz-stage-report.json');
const files = {
  glb: { path: 'model.glb', contentType: 'model/gltf-binary' },
  usdz: { path: 'model.usdz', contentType: 'model/vnd.usdz+zip' },
  poster: { path: 'poster.webp', contentType: 'image/webp' },
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readArtifact = async (name) => {
  const bytes = await readFile(path.join(revisionRoot, files[name].path));
  if (!bytes.length) throw new Error(`${name} is empty`);
  return bytes;
};
const [glb, usdz, poster, source, stageReportBytes] = await Promise.all([
  readArtifact('glb'), readArtifact('usdz'), readArtifact('poster'),
  readFile(path.join(root, 'public/models/sheen_chair.glb')),
  readFile(stageEvidencePath),
]);
if (usdz.length < 100_000) throw new Error('USDZ is not a meaningful model package');
if (poster.length < 1_000) throw new Error('Poster is not a meaningful image');

const archive = unzipSync(new Uint8Array(usdz));
const entries = Object.keys(archive);
if (!entries.length) throw new Error('USDZ ZIP package is empty');
if (entries.some((entry) => entry.startsWith('/') || entry.includes('..') || /^[A-Za-z]:/u.test(entry))) throw new Error('USDZ contains an unsafe package path');
const usdEntries = entries.filter((entry) => /\.usd[ac]?$/iu.test(entry));
const textureEntries = entries.filter((entry) => /\.(png|jpe?g|webp)$/iu.test(entry));
if (!usdEntries.length) throw new Error('USDZ contains no USD stage');
if (!textureEntries.length) throw new Error('USDZ contains no packaged textures');

const sourceParsed = parseGlb(source);
const canonicalParsed = parseGlb(glb);
const sourceBin = sourceParsed.chunks.filter((chunk) => chunk.type !== 0x4e4f534a).map((chunk) => sha256(chunk.data));
const canonicalBin = canonicalParsed.chunks.filter((chunk) => chunk.type !== 0x4e4f534a).map((chunk) => sha256(chunk.data));
if (JSON.stringify(sourceBin) !== JSON.stringify(canonicalBin)) throw new Error('Canonical GLB changed non-JSON chunks');
for (const extension of sourceParsed.json.extensionsUsed ?? []) {
  if (!(canonicalParsed.json.extensionsUsed ?? []).includes(extension)) throw new Error(`Canonical GLB dropped ${extension}`);
}
if (!(canonicalParsed.json.extensionsUsed ?? []).includes('KHR_materials_sheen')) throw new Error('Canonical GLB lost KHR_materials_sheen');
if ((canonicalParsed.json.images?.length ?? 0) !== (sourceParsed.json.images?.length ?? 0)) throw new Error('Canonical GLB changed embedded image count');
if ((canonicalParsed.json.materials?.length ?? 0) !== (sourceParsed.json.materials?.length ?? 0)) throw new Error('Canonical GLB changed material count');

const glbBounds = await measureGlbFile(path.join(revisionRoot, 'model.glb'));
let parsedStageEvidence;
try {
  parsedStageEvidence = JSON.parse(stageReportBytes.toString('utf8'));
} catch (error) {
  throw new Error(`USDZ validation evidence is malformed: ${error instanceof Error ? error.message : String(error)}`);
}
const stageReport = validateUsdzEvidence(parsedStageEvidence, {
  assetRevisionId: AR0_REVISION_ID,
  usdzSha256: sha256(usdz),
  glbSize: glbBounds.size,
});
const usdzSize = stageReport.stageBounds.sizeMeters;
if (Math.abs(glbBounds.min[1]) > 0.001 || Math.abs(glbBounds.center[0]) > 0.001 || Math.abs(glbBounds.center[2]) > 0.001) {
  throw new Error('Canonical GLB does not meet floor/centering tolerance');
}

const records = {};
for (const [key, definition] of Object.entries(files)) {
  const bytes = key === 'glb' ? glb : key === 'usdz' ? usdz : poster;
  records[key] = { path: definition.path, sha256: sha256(bytes) };
}
const manifest = { schemaVersion: 1, assetRevisionId: AR0_REVISION_ID, assetId: 'sheenChair', files: records };
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
if (staged) {
  const existingManifest = await readFile(path.join(revisionRoot, 'manifest.json'));
  if (!existingManifest.equals(manifestBytes)) throw new Error('Staged manifest does not match artifact bytes');
} else {
  await writeFile(path.join(revisionRoot, 'manifest.json'), manifestBytes);
}
const checksumEntries = [
  ...Object.entries(files).map(([key, definition]) => {
    const bytes = key === 'glb' ? glb : key === 'usdz' ? usdz : poster;
    return { path: definition.path, bytes: bytes.length, sha256: sha256(bytes), contentType: definition.contentType };
  }),
  { path: 'manifest.json', bytes: manifestBytes.length, sha256: sha256(manifestBytes), contentType: 'application/json; charset=utf-8' },
];
const checksums = { schemaVersion: 1, assetRevisionId: AR0_REVISION_ID, files: checksumEntries };
const checksumBytes = Buffer.from(`${JSON.stringify(checksums, null, 2)}\n`);
if (staged) {
  const existingChecksums = await readFile(path.join(revisionRoot, 'checksums.json'));
  if (!existingChecksums.equals(checksumBytes)) throw new Error('Staged checksums do not match artifact bytes');
} else {
  await writeFile(path.join(revisionRoot, 'checksums.json'), checksumBytes);
}
console.log(JSON.stringify({ glbBounds, usdzSizeMeters: usdzSize, package: { entries, usdEntries, textureEntries }, manifest, checksums }, null, 2));
