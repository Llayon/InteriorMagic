import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec2, Vec3 } from '@/editor/model/types';
import { isPlacementValid } from '@/editor/placement/collision';
import { resolveSnap, type SnapState } from '@/editor/placement/snap';

export interface DragPreview {
  position: Vec3;
  valid: boolean;
  snapState: SnapState;
}

interface DragState {
  pointerId: number;
  object: FurnitureInstance;
  initial: Vec3;
  grabOffset: Vec2;
  preview: Vec3;
  lastValid: Vec3;
  valid: boolean;
  snapState: SnapState;
}

export class DragController {
  private state: DragState | null = null;

  begin(pointerId: number, object: FurnitureInstance, floorIntersection: Vec2) {
    this.state = {
      pointerId,
      object: structuredClone(object),
      initial: { ...object.position },
      grabOffset: {
        x: object.position.x - floorIntersection.x,
        z: object.position.z - floorIntersection.z,
      },
      preview: { ...object.position },
      lastValid: { ...object.position },
      valid: true,
      snapState: {},
    };
  }

  update(pointerId: number, floorIntersection: Vec2, project: RoomProject): DragPreview | null {
    if (!this.state || this.state.pointerId !== pointerId) return null;
    const raw = {
      x: floorIntersection.x + this.state.grabOffset.x,
      z: floorIntersection.z + this.state.grabOffset.z,
    };
    const asset = getAsset(this.state.object.assetId);
    const resolved = resolveSnap(raw, project, asset, this.state.object.rotationY, this.state.snapState);
    this.state.snapState = resolved.state;
    const position = { x: resolved.position.x, y: this.state.object.position.y, z: resolved.position.z };
    const candidate = { ...this.state.object, position };
    const valid = isPlacementValid(project, candidate);
    this.state.preview = position;
    this.state.valid = valid;
    if (valid) this.state.lastValid = { ...position };
    return { position, valid, snapState: resolved.state };
  }

  finish(pointerId: number): Vec3 | null {
    if (!this.state || this.state.pointerId !== pointerId) return null;
    const result = this.state.valid ? this.state.preview : this.state.lastValid;
    this.state = null;
    return { ...result };
  }

  cancel(pointerId: number): Vec3 | null {
    if (!this.state || this.state.pointerId !== pointerId) return null;
    const result = this.state.initial;
    this.state = null;
    return { ...result };
  }

  get snapshot() { return this.state ? structuredClone(this.state) : null; }
}
