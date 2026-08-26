import { readdir } from 'node:fs/promises';
import path from 'node:path';

const distAr0 = path.join(process.cwd(), 'dist', 'ar0');
try {
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walk(child));
      else files.push(child);
    }
    return files;
  };
  if ((await walk(distAr0)).length) throw new Error('AR0 release artifacts must not be copied into the production Pages dist');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log('Production artifact boundary verified: dist/ar0 is absent');
