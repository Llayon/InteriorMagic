import { access, readdir } from 'node:fs/promises';
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
  // Existing fixture models under dist/models are unrelated; these names are
  // unique to the M1A licensed delivery and must never be emitted here.
  const licensedM1aIds = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'];
  for (const id of licensedM1aIds) {
    if (files.some((file) => file.includes(`${path.sep}__m1a_assets__${path.sep}`) && file.endsWith(`${path.sep}${id}.glb`))) throw new Error(`Licensed M1A GLB emitted: ${id}`);
    if (files.some((file) => file.includes(`${path.sep}__m1a_assets__${path.sep}`) && file.endsWith(`${path.sep}${id}.png`))) throw new Error(`M1A thumbnail emitted: ${id}`);
  }
  // Existing fixture models under dist/models may share carpet/chair/lamp
  // filenames; only the private M1A output namespace is authoritative here.
} catch (error) { if (error?.code !== 'ENOENT') throw error; }
const tracked = execFileSync('git', ['ls-files', '.agent-data'], { encoding: 'utf8' }).trim();
if (tracked) throw new Error(`.agent-data binaries must not be tracked: ${tracked}`);
await access(path.join(root, 'vite.config.ts'));
console.log('M1A production boundary verified');
