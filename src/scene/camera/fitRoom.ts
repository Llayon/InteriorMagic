import * as THREE from 'three';
import type CameraControlsImpl from 'camera-controls';
import type { RoomProject } from '@/editor/model/types';

export interface WorkspaceInsets { top: number; right: number; bottom: number; left: number }
const HOME_DIRECTION = new THREE.Vector3(5, 3.25, 6.5).normalize();
const MARGIN = 16;

function roomCorners(room: RoomProject['room']) {
  const corners: THREE.Vector3[] = [];
  for (const x of [-room.width / 2, room.width / 2]) for (const y of [0, room.height]) for (const z of [-room.depth / 2, room.depth / 2]) corners.push(new THREE.Vector3(x, y, z));
  return corners;
}

function projectedBounds(camera: THREE.PerspectiveCamera, corners: THREE.Vector3[], canvas: { width: number; height: number }) {
  const points = corners.map((corner) => corner.clone().project(camera));
  const xs = points.map((point) => (point.x + 1) * canvas.width / 2);
  const ys = points.map((point) => (1 - point.y) * canvas.height / 2);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

export async function fitRoom(camera: THREE.PerspectiveCamera, controls: CameraControlsImpl, room: RoomProject['room'], canvas: { width: number; height: number }, insets: WorkspaceInsets, transition: boolean, preserveDirection = false) {
  const usable = { left: insets.left + MARGIN, right: canvas.width - insets.right - MARGIN, top: insets.top + MARGIN, bottom: canvas.height - insets.bottom - MARGIN };
  const usableCenter = { x: (usable.left + usable.right) / 2, y: (usable.top + usable.bottom) / 2 };
  const center = new THREE.Vector3(0, room.height / 2, 0);
  const direction = preserveDirection ? camera.getWorldDirection(new THREE.Vector3()).negate().normalize() : HOME_DIRECTION;
  const probe = camera.clone(); probe.aspect = canvas.width / canvas.height; probe.updateProjectionMatrix();
  const corners = roomCorners(room);
  const evaluate = (distance: number) => {
    probe.position.copy(center).addScaledVector(direction, distance); probe.lookAt(center); probe.updateMatrixWorld(true);
    const bounds = projectedBounds(probe, corners, canvas);
    const dx = usableCenter.x - (bounds.left + bounds.right) / 2, dy = usableCenter.y - (bounds.top + bounds.bottom) / 2;
    return { bounds, dx, dy, fits: bounds.left + dx >= usable.left && bounds.right + dx <= usable.right && bounds.top + dy >= usable.top && bounds.bottom + dy <= usable.bottom };
  };
  let low = 4.8, high = 18;
  for (let index = 0; index < 16; index += 1) { const middle = (low + high) / 2; if (evaluate(middle).fits) high = middle; else low = middle; }
  const distance = high, result = evaluate(distance);
  const vFov = THREE.MathUtils.degToRad(camera.fov), worldPerPixel = 2 * distance * Math.tan(vFov / 2) / canvas.height;
  const position = center.clone().addScaledVector(direction, distance);
  await Promise.all([
    controls.setLookAt(position.x, position.y, position.z, center.x, center.y, center.z, transition),
    controls.setFocalOffset(-result.dx * worldPerPixel, result.dy * worldPerPixel, 0, transition),
  ]);
}
