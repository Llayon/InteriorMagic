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
  const licensedM1aIds = ['coffee_table_026', 'dresser_001', 'electronics', 'sofa_030'];
  if (files.some((file) => licensedM1aIds.some((id) => file.endsWith(`${path.sep}${id}.glb`)))) throw new Error('Licensed M1A GLBs must not enter production dist');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }
const tracked = execFileSync('git', ['ls-files', '.agent-data'], { encoding: 'utf8' }).trim();
if (tracked) throw new Error(`.agent-data binaries must not be tracked: ${tracked}`);
await access(path.join(root, 'vite.config.ts'));
console.log('M1A production boundary verified');
