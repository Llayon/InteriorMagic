import type { RoomProject } from '@/editor/model/types';
import type { ResolvePlannerTargets } from './fixtures';

export const createLiveProjectTargetResolver = (
  readProject: () => RoomProject,
): ResolvePlannerTargets => (ids) => {
  const known = new Set(readProject().objects.map((object) => object.instanceId));
  return new Set(ids.filter((id) => known.has(id)));
};
