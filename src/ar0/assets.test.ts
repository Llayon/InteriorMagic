import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAsset } from '@/editor/assets/registry';
import { measureGlbFile } from '../../scripts/ar0/glb-bounds.mjs';
import { getAr0Revision } from './revisions';
import { parseAr0Manifest } from './manifest';

const revisionRoot = path.resolve('artifacts/ar0/sheen-chair/r1');
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');

describe('AR0 immutable Sheen Chair assets', () => {
  it('requires the canonical derivative because the raw GLB is not centered', async () => {
    const raw = await measureGlbFile(path.resolve('public/models/sheen_chair.glb'));
    const canonical = await measureGlbFile(path.join(revisionRoot, 'model.glb'));
    expect(Math.abs(raw.center[2])).toBeGreaterThan(0.001);
    expect(Math.abs(canonical.center[0])).toBeLessThanOrEqual(0.001);
    expect(Math.abs(canonical.center[2])).toBeLessThanOrEqual(0.001);
    expect(Math.abs(canonical.min[1])).toBeLessThanOrEqual(0.001);
  });

  it('matches authoritative Asset Definition dimensions within 1%', async () => {
    const asset = getAsset('sheenChair');
    const bounds = await measureGlbFile(path.join(revisionRoot, 'model.glb'));
    const expected = [asset.dimensions.width, asset.dimensions.height, asset.dimensions.depth];
    bounds.size.forEach((actual, axis) => {
      expect(Number.isFinite(actual)).toBe(true);
      expect(actual).toBeGreaterThan(0);
      expect(Math.abs(actual - expected[axis]!) / expected[axis]!).toBeLessThanOrEqual(0.01);
    });
  });

  it('binds manifest and checksums to exact staged bytes without physical metadata duplication', async () => {
    const revision = getAr0Revision('sheen-chair-r1')!;
    const manifestBytes = await readFile(path.join(revisionRoot, 'manifest.json'));
    const manifest = parseAr0Manifest(JSON.parse(manifestBytes.toString('utf8')), revision);
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain('dimensions');
    expect(serialized).not.toContain('footprint');
    expect(serialized).not.toContain('placement');
    expect(serialized).not.toContain('semantic');
    for (const file of Object.values(manifest.files)) {
      expect(sha256(await readFile(path.join(revisionRoot, file.path)))).toBe(file.sha256);
    }
    const checksums = JSON.parse((await readFile(path.join(revisionRoot, 'checksums.json'))).toString('utf8')) as { files: { path: string; sha256: string }[] };
    expect(checksums.files.find((file) => file.path === 'manifest.json')?.sha256).toBe(sha256(manifestBytes));
  });

  it('passes staged GLB/USDZ package validation without Blender in the runtime path', () => {
    expect(() => execFileSync(process.execPath, ['scripts/ar0/validate-revision.mjs', '--staged'], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow();
  });
});
