import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, '.agent-data/ar0/sheen-chair-r1');
const destinationRoot = path.join(root, 'artifacts/ar0/sheen-chair/r1');
const payload = ['model.glb', 'model.usdz', 'poster.webp', 'manifest.json'];

await mkdir(destinationRoot, { recursive: true });
const stage = async (file) => {
  const source = await readFile(path.join(sourceRoot, file));
  const destination = path.join(destinationRoot, file);
  const existing = await readFile(destination).catch(() => null);
  if (existing && !existing.equals(source)) throw new Error(`Immutable local revision conflict: ${file}`);
  if (!existing) await writeFile(destination, source);
  return existing ? 'identical' : 'staged';
};
for (const file of payload) console.log(`${file}: ${await stage(file)}`);
console.log(`checksums.json: ${await stage('checksums.json')}`);
