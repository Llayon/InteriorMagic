import * as THREE from 'three';
import type CameraControlsImpl from 'camera-controls';
import type { RoomProject } from '@/editor/model/types';

export interface WorkspaceInsets { top: number; right: number; bottom: number; left: number }
const HOME_DIRECTION = new THREE.Vector3(5, 3.25, 6.5).normalize();

export async function fitRoom(camera: THREE.PerspectiveCamera, controls: CameraControlsImpl, room: RoomProject['room'], canvas: { width: number; height: number }, insets: WorkspaceInsets, transition: boolean, preserveDirection = false) {
  const usableWidth = Math.max(160, canvas.width - insets.left - insets.right);
  const usableHeight = Math.max(160, canvas.height - insets.top - insets.bottom);
  const center = new THREE.Vector3(0, room.height / 2, 0);
  const currentTarget = controls.getTarget(new THREE.Vector3(), false);
  const direction = preserveDirection ? camera.position.clone().sub(currentTarget).normalize() : HOME_DIRECTION;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(vFov / 2) * usableWidth / usableHeight);
  const halfWidth = Math.hypot(room.width / 2, room.depth / 2);
  const distance = THREE.MathUtils.clamp(Math.max(halfWidth / Math.tan(horizontalFov / 2), (room.height / 2) / Math.tan(vFov / 2)) * 1.7, 4.8, 18);
  const usableCenterX = insets.left + usableWidth / 2;
  const usableCenterY = insets.top + usableHeight / 2;
  const worldPerPixel = 2 * distance * Math.tan(vFov / 2) / canvas.height;
  const position = center.clone().addScaledVector(direction, distance);
  await Promise.all([
    controls.setLookAt(position.x, position.y, position.z, center.x, center.y, center.z, transition),
    controls.setFocalOffset(-(usableCenterX - canvas.width / 2) * worldPerPixel, (usableCenterY - canvas.height / 2) * worldPerPixel, 0, transition),
  ]);
}
