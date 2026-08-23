import * as THREE from 'three';
import type { TextureMemoryEstimate, TextureDetail } from './deviceReport';

/** Scene-level texture discovery for the device report.
 *  This is a heuristic ESTIMATE, never measured GPU memory: it cannot see
 *  PMREM/environment intermediates, driver representation or compressed
 *  internal formats. renderer.info.memory.textures remains the authoritative
 *  COUNT; this module only adds dimensions and a labelled byte heuristic. */

export const TEXTURE_ESTIMATE_METHOD = 'dimensions-x-bytes4-x-mip1.33-heuristic';
export const TEXTURE_ESTIMATE_COVERAGE = 'scene-discoverable-textures-only; excludes PMREM/env intermediates and driver-internal formats';

const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'alphaMap', 'specularMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'sheenColorMap',
] as const;

interface DiscoveredTexture { width: number | null; height: number | null }

const imageDimensions = (texture: THREE.Texture): DiscoveredTexture => {
  const image = texture.image as { width?: unknown; height?: unknown } | undefined;
  const width = typeof image?.width === 'number' ? image.width : null;
  const height = typeof image?.height === 'number' ? image.height : null;
  return { width, height };
};

const estimateBytes = ({ width, height }: DiscoveredTexture): number =>
  width && height ? width * height * 4 * 1.33 : 0;

export interface SceneTextureScan {
  assetId: string;
  textures: Array<{ name: string; width: number | null; height: number | null }>;
  estimatedBytes: number;
}

export const scanSceneTextures = (assetId: string, scene: THREE.Object3D): SceneTextureScan => {
  const discovered = new Map<string, DiscoveredTexture>();
  const names = new Map<string, string>();
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.Material)) continue;
      for (const slot of TEXTURE_SLOTS) {
        const texture = (material as unknown as Record<string, THREE.Texture | null>)[slot];
        if (!(texture instanceof THREE.Texture)) continue;
        if (!discovered.has(texture.uuid)) discovered.set(texture.uuid, imageDimensions(texture));
        if (!names.has(texture.uuid)) names.set(texture.uuid, texture.name || slot);
      }
    }
  });
  let estimatedBytes = 0;
  const textures: SceneTextureScan['textures'] = [];
  for (const [uuid, dims] of discovered) {
    estimatedBytes += estimateBytes(dims);
    textures.push({ name: `${assetId}/${names.get(uuid) ?? 'unnamed'}`, ...dims });
  }
  return { assetId, textures, estimatedBytes: Math.round(estimatedBytes) };
};

export const aggregateTextureEstimate = (
  scans: readonly SceneTextureScan[],
): { memory: TextureMemoryEstimate & { textures: number }; details: TextureDetail[] } => {
  const details: TextureDetail[] = [];
  let bytes = 0;
  let count = 0;
  for (const scan of scans) {
    bytes += scan.estimatedBytes;
    count += scan.textures.length;
    for (const texture of scan.textures) details.push({ assetId: scan.assetId, textureName: texture.name, width: texture.width, height: texture.height });
  }
  return {
    memory: { kind: 'estimate', bytes, method: TEXTURE_ESTIMATE_METHOD, coverage: TEXTURE_ESTIMATE_COVERAGE, textures: count },
    details,
  };
};