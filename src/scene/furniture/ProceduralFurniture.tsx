import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { getAsset } from '@/editor/assets/registry';

const Mat = ({ color }: { color: string }) => <meshStandardMaterial color={color} roughness={0.72} />;
const Leg = ({ x, z }: { x: number; z: number }) => <mesh position={[x, 0.25, z]}><boxGeometry args={[0.07, 0.5, 0.07]} /><meshStandardMaterial color="#5d4637" roughness={0.8} /></mesh>;

export function ProceduralFurniture({ assetId, variantId }: { assetId: string; variantId?: string }) {
  const root = useRef<THREE.Group>(null);
  const asset = getAsset(assetId);
  const color = asset.variants.find((variant) => variant.id === variantId)?.color ?? asset.variants[0]!.color;
  useLayoutEffect(() => { root.current?.traverse((child) => { if (child instanceof THREE.Mesh) child.raycast = () => undefined; }); }, []);
  let content: ReactNode;
  switch (asset.fallbackPrimitive) {
    case 'sofa': content = <><mesh position={[0, .32, 0]}><boxGeometry args={[1.95, .48, .75]} /><Mat color={color} /></mesh><mesh position={[0, .7, .3]} rotation-x={-.12}><boxGeometry args={[1.95, .65, .18]} /><Mat color={color} /></mesh><mesh position={[-1, .48, 0]}><boxGeometry args={[.16, .55, .8]} /><Mat color={color} /></mesh><mesh position={[1, .48, 0]}><boxGeometry args={[.16, .55, .8]} /><Mat color={color} /></mesh></>; break;
    case 'chair': content = <><mesh position={[0, .43, 0]}><boxGeometry args={[.64, .18, .65]} /><Mat color={color} /></mesh><mesh position={[0, .77, .27]} rotation-x={-.1}><boxGeometry args={[.64, .62, .14]} /><Mat color={color} /></mesh><Leg x={-.25} z={-.23} /><Leg x={.25} z={-.23} /><Leg x={-.25} z={.23} /><Leg x={.25} z={.23} /></>; break;
    case 'table': content = <><mesh position={[0, .72, 0]}><boxGeometry args={[1.35, .12, .78]} /><Mat color={color} /></mesh><Leg x={-.52} z={-.23} /><Leg x={.52} z={-.23} /><Leg x={-.52} z={.23} /><Leg x={.52} z={.23} /></>; break;
    case 'plant': content = <><mesh position={[0, .25, 0]}><cylinderGeometry args={[.22, .28, .5, 12]} /><Mat color="#a86f4e" /></mesh>{[-.18, 0, .18].map((x, index) => <mesh key={x} position={[x, .82 + index * .08, 0]} rotation-z={x * 2}><sphereGeometry args={[.25, 10, 8]} /><Mat color={color} /></mesh>)}</>; break;
    case 'lamp': content = <><mesh position={[0, .03, 0]}><cylinderGeometry args={[.24, .24, .06, 16]} /><Mat color={color} /></mesh><mesh position={[0, .8, 0]}><cylinderGeometry args={[.025, .025, 1.55, 8]} /><Mat color={color} /></mesh><mesh position={[0, 1.48, 0]}><coneGeometry args={[.3, .42, 16, 1, true]} /><meshStandardMaterial color="#e9d9b4" side={THREE.DoubleSide} /></mesh></>; break;
    case 'rug': content = <mesh position={[0, .0125, 0]}><boxGeometry args={[2.2, .025, 1.6]} /><Mat color={color} /></mesh>; break;
  }
  return <group ref={root}>{content}</group>;
}
