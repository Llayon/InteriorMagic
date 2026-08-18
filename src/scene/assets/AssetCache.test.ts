import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getAsset } from '@/editor/assets/registry';
import { instantiateLoadedAsset, parseAssetBuffer } from './AssetCache';

describe('GLB normalization audit', () => {
  it('normalizes the deliberately non-canonical sofa', async () => {
    const file = await readFile(new URL('../../../public/models/ugly_sofa.glb', import.meta.url));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const loaded = await parseAssetBuffer(buffer, getAsset('sofa'));
    const box = new THREE.Box3().setFromObject(loaded.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(center.x).toBeCloseTo(0, 5); expect(center.z).toBeCloseTo(0, 5);
    expect(size.x).toBeGreaterThan(1.9); expect(size.x).toBeLessThan(2.3);
    expect(size.z).toBeGreaterThan(.7); expect(size.z).toBeLessThan(1);
    expect(loaded.scene.getObjectByName('EMPTY_do_not_use_as_pivot')).toBeTruthy();
    expect(loaded.scene.getObjectByName('visual_nested_group')).toBeTruthy();
    const instance = instantiateLoadedAsset(loaded, getAsset('sofa'), 'sand');
    const sourceUpholstery = loaded.scene.getObjectByName('seat_multi_mesh') as THREE.Mesh;
    const instanceUpholstery = instance.getObjectByName('seat_multi_mesh') as THREE.Mesh;
    const sourceFrame = loaded.scene.getObjectByName('hidden_frame') as THREE.Mesh;
    const instanceFrame = instance.getObjectByName('hidden_frame') as THREE.Mesh;
    expect(instanceUpholstery.geometry).toBe(sourceUpholstery.geometry);
    expect(instanceUpholstery.material).not.toBe(sourceUpholstery.material);
    expect(instanceFrame.material).toBe(sourceFrame.material);
  });
});
