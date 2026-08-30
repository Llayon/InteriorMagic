import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FurnitureAssetDefinition } from '@/editor/model/types';

export interface LoadedAsset {
  assetId: string;
  scene: THREE.Group;
  byteSize: number;
  bounds: THREE.Box3;
}

// Per-entry timing trace. Stages are filled in monotonically as the load
// pipeline progresses. Any stage may be undefined if the corresponding
// phase was not reached (e.g. headers fail → bodyReceived is never set).
export interface AssetLoadTiming {
  fetchStart: number;
  headersReceived?: number;
  bodyReceived?: number;
  parseStart?: number;
  parseComplete?: number;
  ready?: number;
  errorAt?: number;
  errorStage?: 'headers' | 'body' | 'parse';
}

// Public-facing derived durations. Negative or NaN values are coerced to 0
// so the diagnostics surface never reports nonsensical numbers.
export interface AssetTimingDurations {
  ttfbMs: number;
  downloadMs: number;
  parseMs: number;
  totalMs: number;
}

export interface AssetDiagnosticsEntry {
  assetId: string;
  status: 'loading' | 'ready' | 'error';
  byteSize: number;
  timing?: AssetTimingDurations;
  errorStage?: 'headers' | 'body' | 'parse';
}

export interface AssetCacheDiagnostics {
  loadedAssets: number;
  byteSize: number;
  assets: AssetDiagnosticsEntry[];
}

type CacheEntry = {
  status: 'loading' | 'ready' | 'error';
  promise: Promise<LoadedAsset>;
  value?: LoadedAsset;
  error?: Error;
  timing: AssetLoadTiming;
};

const loader = new GLTFLoader();
const noRaycast: THREE.Mesh['raycast'] = () => undefined;

const safeMark = (name: string) => {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    try {
      performance.mark(name);
    } catch {
      // Diagnostics only; never affect product behavior.
    }
  }
};

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

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const sanitizeDuration = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
};

const deriveDurations = (timing: AssetLoadTiming): AssetTimingDurations => {
  const ttfbMs = sanitizeDuration(
    timing.headersReceived !== undefined ? timing.headersReceived - timing.fetchStart : undefined,
  );
  const downloadMs = sanitizeDuration(
    timing.bodyReceived !== undefined && timing.headersReceived !== undefined
      ? timing.bodyReceived - timing.headersReceived
      : undefined,
  );
  const parseMs = sanitizeDuration(
    timing.parseComplete !== undefined && timing.parseStart !== undefined
      ? timing.parseComplete - timing.parseStart
      : undefined,
  );
  const totalEnd = timing.ready ?? timing.errorAt;
  const totalMs = sanitizeDuration(totalEnd !== undefined ? totalEnd - timing.fetchStart : undefined);
  return { ttfbMs, downloadMs, parseMs, totalMs };
};

export class AssetCache {
  private entries = new Map<string, CacheEntry>();
  private listeners = new Set<() => void>();
  private revision = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getRevision = () => this.revision;
  private notify() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  load(asset: FurnitureAssetDefinition): Promise<LoadedAsset | null> {
    if (!asset.modelUrl) return Promise.resolve(null);
    const existing = this.entries.get(asset.id);
    if (existing) return existing.promise;
    const timing: AssetLoadTiming = { fetchStart: now() };
    const promise = fetch(asset.modelUrl)
      .then(async (response) => {
        timing.headersReceived = now();
        if (!response.ok) {
          timing.errorAt = now();
          timing.errorStage = 'headers';
          throw new Error(`Could not load ${asset.modelUrl}: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        timing.bodyReceived = now();
        timing.parseStart = now();
        const base = asset.modelUrl!.slice(0, asset.modelUrl!.lastIndexOf('/') + 1);
        const parsed = await parseAssetBuffer(buffer, asset, base);
        timing.parseComplete = now();
        return parsed;
      })
      .then((value) => {
        timing.ready = now();
        const entry = this.entries.get(asset.id);
        if (entry) {
          entry.status = 'ready';
          entry.value = value;
        }
        safeMark(`interiormagic:asset:${asset.id}:ready`);
        this.notify();
        return value;
      })
      .catch((reason: unknown) => {
        if (timing.errorAt === undefined) {
          timing.errorAt = now();
          if (timing.bodyReceived !== undefined && timing.errorStage === undefined) {
            timing.errorStage = 'parse';
          } else if (timing.headersReceived !== undefined && timing.errorStage === undefined) {
            timing.errorStage = 'body';
          } else if (timing.errorStage === undefined) {
            timing.errorStage = 'headers';
          }
        }
        const error = reason instanceof Error ? reason : new Error(String(reason));
        const entry = this.entries.get(asset.id);
        if (entry) {
          entry.status = 'error';
          entry.error = error;
        }
        this.notify();
        throw error;
      });
    this.entries.set(asset.id, { status: 'loading', promise, timing });
    this.notify();
    return promise;
  }

  get(assetId: string) {
    return this.entries.get(assetId);
  }

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

  diagnostics(): AssetCacheDiagnostics {
    const readyEntries = [...this.entries.values()].filter((entry) => entry.status === 'ready' && entry.value);
    const assets: AssetDiagnosticsEntry[] = [];
    for (const [assetId, entry] of this.entries) {
      if (entry.status === 'ready' && entry.value) {
        assets.push({ assetId, status: 'ready', byteSize: entry.value.byteSize, timing: deriveDurations(entry.timing) });
      } else if (entry.status === 'error') {
        assets.push({
          assetId,
          status: 'error',
          byteSize: 0,
          timing: deriveDurations(entry.timing),
          errorStage: entry.timing.errorStage,
        });
      } else {
        assets.push({ assetId, status: 'loading', byteSize: 0, timing: deriveDurations(entry.timing) });
      }
    }
    return {
      loadedAssets: readyEntries.length,
      byteSize: readyEntries.reduce((sum, entry) => sum + (entry.value?.byteSize ?? 0), 0),
      assets,
    };
  }
}

export const assetCache = new AssetCache();