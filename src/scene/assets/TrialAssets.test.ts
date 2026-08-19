import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getAsset } from '@/editor/assets/registry';
import { parseAssetBuffer } from './AssetCache';

const ids = ['nordicSofa', 'nordicArmchair', 'relaxArmchair', 'glassCoffeeTable', 'drawerSideTable', 'roundedRug', 'roundFloorLamp', 'tallPottedPlant', 'leafyPlant', 'lowBookcase'];

describe('Kenney CC0 trial family', () => {
  it('normalizes every production GLB to its metadata dimensions', async () => {
    for (const id of ids) {
      const asset = getAsset(id);
      expect(asset.semantic?.role).toBeTruthy(); expect(asset.thumbnailUrl).toContain('thumbnails/kenney/');
      const file = await readFile(new URL(`../../../public/${asset.modelUrl}`, import.meta.url));
      const loaded = await parseAssetBuffer(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), asset);
      const size = loaded.bounds.getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(asset.dimensions.width, 1); expect(size.y).toBeCloseTo(asset.dimensions.height, 1); expect(size.z).toBeCloseTo(asset.dimensions.depth, 1);
    }
  });
});
