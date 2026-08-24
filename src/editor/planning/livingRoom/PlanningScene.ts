import type { Vec2 } from '@/editor/model/types';
import type { RectBounds } from '@/editor/spatial/geometry';

export type PlanningPlacementType = 'floor' | 'wall';
export type PlanningRole = string;
export type PlanningEntityRole = PlanningRole;

export type PlanningTransform = {
  position: Vec2;
  rotationY: number;
};

export type PlanningEntitySource =
  | { kind: 'roomObject'; instanceId: string }
  | { kind: 'roomStructure'; structuralId: string }
  | { kind: 'derived' };

export type PlanningEntity = {
  id: string;
  source: PlanningEntitySource;
  role: PlanningRole;
  placementType: PlanningPlacementType;
  footprint: RectBounds;
  collision: { group: number; mask: number };
  transform: PlanningTransform;
};

export type PlanningZone = {
  id: string;
  bounds: RectBounds;
  center: Vec2;
  rotationY?: number;
};

export type PlanningScene = {
  room: RectBounds;
  immediateOpeningZones: PlanningZone[];
  circulationZones: PlanningZone[];
  entities: PlanningEntity[];
};
