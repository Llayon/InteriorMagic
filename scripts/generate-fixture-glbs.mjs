import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

globalThis.FileReader = class FileReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const output = new URL('../public/models/', import.meta.url);
await mkdir(output, { recursive: true });

const material = (name, color, roughness = 0.75) => {
  const value = new THREE.MeshStandardMaterial({ color, roughness });
  value.name = name;
  return value;
};
const addBox = (parent, name, size, position, mat) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
};
const addCylinder = (parent, name, radii, height, position, mat, segments = 12) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radii[0], radii[1], height, segments), mat);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
};

const chair = () => {
  const root = new THREE.Group(); root.name = 'chair_root';
  const upholstery = material('upholstery', '#bf765f');
  const wood = material('wood', '#574334');
  addBox(root, 'seat', [.64, .18, .65], [0, .43, 0], upholstery);
  addBox(root, 'back', [.64, .62, .14], [0, .76, .27], upholstery).rotation.x = -.1;
  for (const x of [-.25, .25]) for (const z of [-.23, .23]) addBox(root, 'leg', [.07, .5, .07], [x, .25, z], wood);
  return root;
};
const table = () => {
  const root = new THREE.Group(); root.name = 'table_root';
  const wood = material('wood', '#78533b');
  addBox(root, 'top', [1.35, .12, .78], [0, .7, 0], wood);
  for (const x of [-.52, .52]) for (const z of [-.23, .23]) addBox(root, 'leg', [.07, .64, .07], [x, .32, z], wood);
  return root;
};
const plant = () => {
  const root = new THREE.Group(); root.name = 'plant_root';
  const pot = material('pot', '#a86f4e');
  const foliage = material('foliage', '#66865d');
  addCylinder(root, 'pot', [.22, .28], .5, [0, .25, 0], pot);
  const stem = addCylinder(root, 'stem', [.025, .035], .75, [0, .78, 0], material('stem', '#4c6543'), 8);
  stem.rotation.z = .08;
  for (const [x, y, z, scale] of [[-.16,.88,0,.24],[.16,1.02,.02,.26],[0,1.18,0,.3]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(scale, 10, 8), foliage);
    leaf.name = 'leaf'; leaf.position.set(x, y, z); leaf.scale.z = .65; root.add(leaf);
  }
  return root;
};
const rug = () => {
  const root = new THREE.Group(); root.name = 'rug_root';
  addBox(root, 'rug_surface', [2.2, .025, 1.6], [0, .0125, 0], material('rug_fabric', '#a7634d', .95));
  return root;
};
const uglySofa = () => {
  const exportedRoot = new THREE.Group(); exportedRoot.name = 'exporter_root_with_bad_transform';
  exportedRoot.scale.setScalar(.01);
  exportedRoot.rotation.y = Math.PI / 2;
  const empty = new THREE.Group(); empty.name = 'EMPTY_do_not_use_as_pivot'; exportedRoot.add(empty);
  const pivotOffset = new THREE.Group(); pivotOffset.name = 'nested_offset_pivot';
  pivotOffset.position.set(1.37, .41, -.63); exportedRoot.add(pivotOffset);
  const visual = new THREE.Group(); visual.name = 'visual_nested_group'; pivotOffset.add(visual);
  const upholstery = material('upholstery', '#758878');
  const frame = material('frame', '#4a3528');
  addBox(visual, 'seat_multi_mesh', [1.95, .48, .75], [0, .32, 0], upholstery);
  addBox(visual, 'back_multi_mesh', [1.95, .65, .18], [0, .69, .3], upholstery).rotation.x = -.12;
  addBox(visual, 'arm_left', [.16, .55, .8], [-1, .48, 0], upholstery);
  addBox(visual, 'arm_right', [.16, .55, .8], [1, .48, 0], upholstery);
  addBox(visual, 'hidden_frame', [1.7, .1, .55], [0, .12, 0], frame);
  visual.position.y = .27; // Raw floor is intentionally not y=0.
  return exportedRoot;
};

const exporter = new GLTFExporter();
for (const [name, factory] of Object.entries({ chair, table, plant, rug, ugly_sofa: uglySofa })) {
  const scene = new THREE.Scene(); scene.name = `${name}_fixture_scene`; scene.add(factory());
  const buffer = await exporter.parseAsync(scene, { binary: true, trs: true, onlyVisible: false });
  await writeFile(new URL(`${name}.glb`, output), Buffer.from(buffer));
}
