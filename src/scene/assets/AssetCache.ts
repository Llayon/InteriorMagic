import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FurnitureAssetDefinition } from '@/editor/model/types';

export interface LoadedAsset {
  assetId: string;
  scene: THREE.Group;
  byteSize: number;
  bounds: THREE.Box3;
}
type CacheEntry = { status: 'loading' | 'ready' | 'error'; promise: Promise<LoadedAsset>; value?: LoadedAsset; error?: Error };

const loader = new GLTFLoader();
const noRaycast: THREE.Mesh['raycast'] = () => undefined;

const applyScale = (object: THREE.Object3D, scale: number | { x: number; y: number; z: number } | undefined) => {
  if (typeof scale === 'number') object.scale.setScalar(scale);
  else if (scale) object.scale.set(scale.x, scale.y, scale.z);
};

export const normalizeAssetScene = (source: THREE.Object3D, asset: FurnitureAssetDefinition): LoadedAsset['scene'] => {
  const model = source.clone(true);
  model.name = `${asset.id}_normalized_model`;
  const normalization = asset.normalization;
  applyScale(model, normalization?.scale);
  if (normalization?.rotationEuler) {
    const rotation = normalization.rotationEuler;
    model.rotation.set(rotation.x, rotation.y, rotation.z);
  }
  if (normalization?.translation) {
    const translation = normalization.translation;
    model.position.set(translation.x, translation.y, translation.z);
  }
  model.updateMatrixWorld(true);
  if (normalization?.recenterToFootprint !== false) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.add(new THREE.Vector3(-center.x, -box.min.y, -center.z));
  }
  model.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = `${asset.id}_canonical_root`;
  root.add(model);
  return root;
};

const auditBounds = (asset: FurnitureAssetDefinition, scene: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const expected = asset.dimensions;
  const deltas = [
    Math.abs(size.x - expected.width) / expected.width,
    Math.abs(size.y - expected.height) / Math.max(expected.height, 0.01),
    Math.abs(size.z - expected.depth) / expected.depth,
  ];
  if (import.meta.env.DEV && deltas.some((delta) => delta > 0.12)) {
    console.warn(`[AssetLoader] ${asset.id} bounds differ from metadata`, { size, expected });
  }
  return box;
};

export const parseAssetBuffer = async (
  buffer: ArrayBuffer,
  asset: FurnitureAssetDefinition,
  resourcePath = '/',
): Promise<LoadedAsset> => {
  const gltf = await loader.parseAsync(buffer, resourcePath);
  const scene = normalizeAssetScene(gltf.scene, asset);
  const bounds = auditBounds(asset, scene);
  return { assetId: asset.id, scene, byteSize: buffer.byteLength, bounds };
};

export const instantiateLoadedAsset = (
  loaded: LoadedAsset,
  asset: FurnitureAssetDefinition,
  variantId?: string,
): THREE.Group => {
  const instance = loaded.scene.clone(true);
  const variant = asset.variants.find((item) => item.id === variantId);
  const overrides = variant?.materialOverrides;
  const owned = new Set<THREE.Material>();
  instance.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.raycast = noRaycast;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const next = materials.map((material) => {
      const override = overrides?.[material.name];
      if (!override) return material;
      const clone = material.clone();
      clone.name = material.name;
      if (clone instanceof THREE.MeshStandardMaterial) clone.color.set(override.color);
      owned.add(clone);
      return clone;
    });
    child.material = Array.isArray(child.material) ? next : next[0]!;
  });
  instance.userData.ownedMaterials = owned;
  return instance;
};

class AssetCache {
  private entries = new Map<string, CacheEntry>();
  private listeners = new Set<() => void>();
  private revision = 0;

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getRevision = () => this.revision;
  private notify() { this.revision += 1; this.listeners.forEach((listener) => listener()); }

  load(asset: FurnitureAssetDefinition): Promise<LoadedAsset | null> {
    if (!asset.modelUrl) return Promise.resolve(null);
    const existing = this.entries.get(asset.id);
    if (existing) return existing.promise;
    const promise = fetch(asset.modelUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load ${asset.modelUrl}: ${response.status}`);
        const buffer = await response.arrayBuffer();
        const base = asset.modelUrl!.slice(0, asset.modelUrl!.lastIndexOf('/') + 1);
        return parseAssetBuffer(buffer, asset, base);
      })
      .then((value) => { const entry = this.entries.get(asset.id); if (entry) { entry.status = 'ready'; entry.value = value; } this.notify(); return value; })
      .catch((reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        const entry = this.entries.get(asset.id); if (entry) { entry.status = 'error'; entry.error = error; }
        this.notify(); throw error;
      });
    this.entries.set(asset.id, { status: 'loading', promise });
    this.notify();
    return promise;
  }

  get(assetId: string) { return this.entries.get(assetId); }

  instantiate(asset: FurnitureAssetDefinition, variantId?: string): THREE.Group | null {
    const loaded = this.entries.get(asset.id)?.value;
    if (!loaded) return null;
    return instantiateLoadedAsset(loaded, asset, variantId);
  }

  disposeInstance(instance: THREE.Object3D) {
    const owned = instance.userData.ownedMaterials as Set<THREE.Material> | undefined;
    owned?.forEach((material) => material.dispose());
  }

  metrics() {
    const ready = [...this.entries.values()].filter((entry) => entry.status === 'ready' && entry.value);
    return { loadedAssets: ready.length, byteSize: ready.reduce((sum, entry) => sum + (entry.value?.byteSize ?? 0), 0) };
  }
}

export const assetCache = new AssetCache();
