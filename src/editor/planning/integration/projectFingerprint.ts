import type { RoomProject } from '@/editor/model/types';

const compareLexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export const planningProjectFingerprint = (project: RoomProject): string => JSON.stringify({
  room: {
    width: project.room.width,
    depth: project.room.depth,
    height: project.room.height,
  },
  objects: [...project.objects]
    .sort((a, b) => compareLexical(a.instanceId, b.instanceId))
    .map((object) => ({
      instanceId: object.instanceId,
      assetId: object.assetId,
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotationY: object.rotationY,
    })),
});
