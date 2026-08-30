import { getAsset } from '@/editor/assets/registry';
import type { FurnitureInstance, RoomProject, Vec2, Vec3 } from '@/editor/model/types';
import { isPlacementValid } from '@/editor/placement/collision';
import { resolveSnap, type SnapState } from '@/editor/placement/snap';
import { normalizeRotation, signedRotationDelta, snapRotation } from './rotation';

export type TransformMode = 'idle' | 'dragging' | 'rotating' | 'draining';
export interface TransformPreview { position: Vec3; rotationY: number; valid: boolean; snapped: boolean }
export interface PointerSample { pointerId: number; pointerType: string; clientX: number; clientY: number }
export interface TransformResult { position: Vec3; rotationY: number; changed: boolean }

export class ObjectTransformController {
  private object: FurnitureInstance | null = null;
  private project: RoomProject | null = null;
  private pointers = new Map<number, PointerSample>();
  private initialPairAngle = 0;
  private rotationBefore = 0;
  private grabOffset: Vec2 = { x: 0, z: 0 };
  private snapState: SnapState = {};
  private startTransform: TransformResult | null = null;
  private preview: TransformPreview | null = null;
  private lastValid: TransformPreview | null = null;
  private lastValidSnapped: TransformPreview | null = null;
  private gestureRotating = false;
  mode: TransformMode = 'idle';

  begin(sample: PointerSample, object: FurnitureInstance, floor: Vec2, project: RoomProject): boolean {
    const asset = getAsset(object.assetId);
    if (this.mode !== 'idle' || asset.placement.anchor !== 'floor') return false;
    this.object = structuredClone(object); this.project = project;
    this.pointers.set(sample.pointerId, { ...sample });
    this.grabOffset = { x: object.position.x - floor.x, z: object.position.z - floor.z };
    this.rotationBefore = object.rotationY; this.startTransform = { position: { ...object.position }, rotationY: object.rotationY, changed: false };
    this.preview = { position: { ...object.position }, rotationY: object.rotationY, valid: true, snapped: false };
    this.lastValid = this.preview; this.lastValidSnapped = null; this.mode = 'dragging';
    return true;
  }

  addPointer(sample: PointerSample): boolean {
    if (!this.object || !getAsset(this.object.assetId).rotation.enabled || this.pointers.size >= 2 || sample.pointerType !== 'touch' || this.mode === 'idle') return false;
    this.pointers.set(sample.pointerId, { ...sample });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [PointerSample, PointerSample];
      this.initialPairAngle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
      this.rotationBefore = this.preview?.rotationY ?? this.object.rotationY;
      this.mode = 'rotating'; this.gestureRotating = true;
    }
    return true;
  }

  update(sample: PointerSample, floor: Vec2 | null): TransformPreview | null {
    if (!this.object || !this.project || !this.pointers.has(sample.pointerId)) return null;
    this.pointers.set(sample.pointerId, { ...sample });
    const asset = getAsset(this.object.assetId);
    let position = this.preview?.position ?? this.object.position;
    let rotationY = this.preview?.rotationY ?? this.object.rotationY;
    if (this.mode === 'dragging' && floor) {
      const raw = { x: floor.x + this.grabOffset.x, z: floor.z + this.grabOffset.z };
      const resolved = resolveSnap(raw, this.project, asset, rotationY, this.snapState);
      this.snapState = resolved.state; position = { x: resolved.position.x, y: this.object.position.y, z: resolved.position.z };
    } else if (this.mode === 'rotating' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [PointerSample, PointerSample];
      const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
      const continuous = normalizeRotation(this.rotationBefore + signedRotationDelta(this.initialPairAngle, angle));
      const nearest = snapRotation(continuous, asset.rotation.stepDegrees);
      const threshold = (Math.abs(signedRotationDelta(continuous, nearest)) <= 8 * Math.PI / 180 ? 8 : 4) * Math.PI / 180;
      rotationY = Math.abs(signedRotationDelta(continuous, nearest)) <= threshold ? nearest : continuous;
    }
    const candidate = { ...this.object, position, rotationY };
    const valid = isPlacementValid(this.project, candidate);
    const next = { position, rotationY, valid, snapped: Math.abs(signedRotationDelta(rotationY, snapRotation(rotationY, asset.rotation.stepDegrees))) <= 1e-6 };
    this.preview = next;
    if (valid) { this.lastValid = next; if (next.snapped) this.lastValidSnapped = next; }
    return next;
  }

  release(pointerId: number): TransformResult | null {
    if (!this.pointers.has(pointerId) || !this.object || !this.project || !this.startTransform) return null;
    const wasRotating = this.gestureRotating;
    this.pointers.delete(pointerId);
    if (this.pointers.size > 0) { this.mode = 'draining'; return null; }
    const asset = getAsset(this.object.assetId);
    const exact = wasRotating && this.preview ? { ...this.preview, rotationY: snapRotation(this.preview.rotationY, asset.rotation.stepDegrees) } : null;
    const candidates = [exact, this.lastValidSnapped, this.lastValid].filter(Boolean) as TransformPreview[];
    const chosen = candidates.find((candidate) => isPlacementValid(this.project!, { ...this.object!, position: candidate.position, rotationY: candidate.rotationY })) ?? this.startTransform;
    const result = { position: { ...chosen.position }, rotationY: chosen.rotationY, changed: Math.hypot(chosen.position.x - this.startTransform.position.x, chosen.position.y - this.startTransform.position.y, chosen.position.z - this.startTransform.position.z) > 1e-6 || Math.abs(signedRotationDelta(chosen.rotationY, this.startTransform.rotationY)) > 1e-6 };
    this.reset(); return result;
  }

  cancel(): TransformResult | null { if (!this.startTransform) return null; const result = { ...this.startTransform, position: { ...this.startTransform.position }, changed: false }; this.reset(); return result; }
  get activePointerIds() { return [...this.pointers.keys()]; }
  get snapshot() { return this.startTransform ? { startTransform: structuredClone(this.startTransform), preview: structuredClone(this.preview), mode: this.mode } : null; }
  private reset() { this.object = null; this.project = null; this.pointers.clear(); this.startTransform = null; this.preview = null; this.lastValid = null; this.lastValidSnapped = null; this.gestureRotating = false; this.mode = 'idle'; }
}
