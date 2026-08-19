import * as THREE from 'three';

const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { color: { value: new THREE.Color('#40362d') }, opacity: { value: 0.17 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform vec3 color; uniform float opacity; void main(){ vec2 p=(vUv-.5)*2.; float a=1.-smoothstep(.12,1.,length(p)); gl_FragColor=vec4(color,a*opacity); }',
});

export function FurnitureGrounding({ width, depth }: { width: number; depth: number }) {
  return <mesh geometry={geometry} material={material} position={[0, .006, 0]} rotation-x={-Math.PI / 2} scale={[width * .88, depth * .84, 1]} raycast={() => undefined} frustumCulled={false} />;
}
