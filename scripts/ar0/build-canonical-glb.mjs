import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodeGlb, measureGlbJson, parseGlb } from './glb-bounds.mjs';

const root = process.cwd();
const sourceFile = path.join(root, 'public/models/sheen_chair.glb');
const outputRoot = path.join(root, '.agent-data/ar0/sheen-chair-r1');
const outputFile = path.join(outputRoot, 'model.glb');
const reportFile = path.join(outputRoot, 'canonical-glb-report.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const source = await readFile(sourceFile);
const parsed = parseGlb(source);
const rawBounds = measureGlbJson(parsed.json);
const sceneIndex = parsed.json.scene ?? 0;
const scene = parsed.json.scenes?.[sceneIndex];
if (!scene) throw new Error('Default scene is missing');

const translation = [-rawBounds.center[0], -rawBounds.min[1], -rawBounds.center[2]].map((value) => Object.is(value, -0) ? 0 : value);
const wrapperIndex = parsed.json.nodes?.length ?? 0;
parsed.json.nodes ??= [];
parsed.json.nodes.push({ name: 'sheenChair_ar0_canonical_root', translation, children: [...(scene.nodes ?? [])] });
scene.nodes = [wrapperIndex];

const canonical = encodeGlb(parsed.json, parsed.chunks);
const canonicalParsed = parseGlb(canonical);
const canonicalBounds = measureGlbJson(canonicalParsed.json);
await mkdir(outputRoot, { recursive: true });
await writeFile(outputFile, canonical);
await writeFile(reportFile, `${JSON.stringify({
  schemaVersion: 1,
  assetRevisionId: 'sheen-chair-r1',
  source: { path: 'public/models/sheen_chair.glb', bytes: source.length, sha256: sha256(source), bounds: rawBounds },
  canonical: { path: '.agent-data/ar0/sheen-chair-r1/model.glb', bytes: canonical.length, sha256: sha256(canonical), bounds: canonicalBounds },
  bakedTranslation: translation,
  orientationEvidence: '+Y up and +Z forward preserved; the derivative adds translation only',
}, null, 2)}\n`);
console.log(JSON.stringify({ rawBounds, canonicalBounds, translation, sha256: sha256(canonical) }, null, 2));
