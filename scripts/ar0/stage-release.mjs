import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAr0RevisionArgument } from './revision-config.mjs';

const root = process.cwd();
const revision = parseAr0RevisionArgument(process.argv.slice(2));
const sourceRoot = path.join(root, `.agent-data/ar0/${revision.arRevisionId}`);
const destinationRoot = path.join(root, `artifacts/ar0/sheen-chair/${revision.artifactDirectory}`);
const evidenceRoot = path.join(root, `docs/ar/evidence/${revision.arRevisionId}`);
const payload = ['model.glb', 'model.usdz', 'poster.webp', 'manifest.json'];

await mkdir(destinationRoot, { recursive: true });
const stage = async (file, sourceDirectory = sourceRoot, destinationDirectory = destinationRoot) => {
  const source = await readFile(path.join(sourceDirectory, file));
  const destination = path.join(destinationDirectory, file);
  const existing = await readFile(destination).catch(() => null);
  if (existing && !existing.equals(source)) throw new Error(`Immutable local revision conflict: ${file}`);
  if (!existing) await writeFile(destination, source);
  return existing ? 'identical' : 'staged';
};
for (const file of payload) console.log(`${file}: ${await stage(file)}`);
console.log(`checksums.json: ${await stage('checksums.json')}`);
await mkdir(evidenceRoot, { recursive: true });
console.log(`usdz-stage-report.json: ${await stage('usdz-stage-report.json', sourceRoot, evidenceRoot)}`);
