import { access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const walk = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file)); else result.push(file);
  }
  return result;
};
try {
  const files = await walk(dist);
  if (files.some((file) => file.includes(`${path.sep}__m1a_assets__${path.sep}`))) throw new Error('M1A private assets must not enter production dist');
  const evidence = JSON.parse(await readFile(path.join(root, 'src/editor/catalog/data/production-asset-spatial-evidence-v1.json'), 'utf8'));
  const licensedHashes = new Map(evidence.entries.map((asset) => [asset.canonicalSha256, asset.assetId]));
  for (const file of files.filter((candidate) => /\.(?:glb|usdz)$/i.test(candidate))) {
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    const assetId = licensedHashes.get(hash);
    if (assetId) throw new Error(`Licensed M1A binary emitted in dist: ${assetId} (${path.relative(dist, file)})`);
  }
} catch (error) { if (error?.code !== 'ENOENT') throw error; }
const tracked = execFileSync('git', ['ls-files', '.agent-data'], { encoding: 'utf8' }).trim();
if (tracked) throw new Error(`.agent-data binaries must not be tracked: ${tracked}`);
await access(path.join(root, 'vite.config.ts'));
console.log('M1A production boundary verified');
