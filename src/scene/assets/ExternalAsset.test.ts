import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getAsset } from '@/editor/assets/registry';

const readGlbJson = (buffer: Buffer) => {
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  expect(buffer.readUInt32LE(4)).toBe(2);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  expect(jsonType).toBe(0x4e4f534a);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim()) as {
    asset: { generator?: string };
    extensionsUsed?: string[];
    meshes?: unknown[];
    images?: unknown[];
  };
};

describe('external Sheen Chair asset', () => {
  it('is a real textured GLB wired through registry metadata', async () => {
    const file = await readFile(new URL('../../../public/models/sheen_chair.glb', import.meta.url));
    const json = readGlbJson(file);
    expect(file.byteLength).toBeGreaterThan(4_000_000);
    expect(json.asset.generator).toContain('3dsmax');
    expect(json.extensionsUsed).toContain('KHR_materials_sheen');
    expect(json.meshes).toHaveLength(4);
    expect(json.images).toHaveLength(7);
    const asset = getAsset('sheenChair');
    expect(asset.modelUrl).toBe('models/sheen_chair.glb');
    expect(asset.normalization?.recenterToFootprint).toBe(true);
    expect(asset.footprint).toEqual({ width: 0.84, depth: 0.59 });
  });
});
