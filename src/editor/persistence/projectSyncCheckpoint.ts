/** Partitioned local persistence for H3B local-first sync.
 *
 *  Privacy invariant (review condition #2): the anonymous draft keeps the
 *  legacy key for backward compatibility, while an attached project lives only
 *  under a full SHA-256 partition of the owner's internal user id. A cached
 *  attached document is never hydrated for a different account. */

import type { RoomProject } from '@/editor/model/types';
import { LocalProjectStorage, type ProjectStorage } from '@/editor/serialization/project';
import type { ProjectSyncCheckpointV1 } from './types';

export const DRAFT_PROJECT_KEY = 'interior-magic-project-v1';

export interface PartitionKeys {
  projectKey: string;
  checkpointKey: string;
}

export const partitionKeysFor = (ownerUserIdHash: string): PartitionKeys => ({
  projectKey: `interior-magic-project-v1:u:${ownerUserIdHash}`,
  checkpointKey: `interior-magic-sync-checkpoint-v1:u:${ownerUserIdHash}`,
});

/** Full SHA-256 hex of the internal user id — no truncation. */
export const ownerPartitionHash = async (userId: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export type CheckpointLikeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shape-validating read; any corruption reads as "no checkpoint" (fail-safe). */
export const parseCheckpoint = (value: unknown): ProjectSyncCheckpointV1 | null => {
  if (!isRecord(value) || value['version'] !== 1) return null;
  const { ownerUserIdHash, projectId, revision, lastSyncedHash } = value as Record<string, unknown>;
  if (typeof ownerUserIdHash !== 'string' || typeof projectId !== 'string') return null;
  if (revision !== null && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)) return null;
  if (lastSyncedHash !== null && typeof lastSyncedHash !== 'string') return null;
  return value as unknown as ProjectSyncCheckpointV1;
};

export class ProjectSyncCheckpointStore {
  constructor(private readonly storage: CheckpointLikeStorage = globalThis.localStorage as Storage) {}

  read(partitionHash: string): ProjectSyncCheckpointV1 | null {
    try {
      const raw = this.storage.getItem(partitionKeysFor(partitionHash).checkpointKey);
      if (raw === null) return null;
      return parseCheckpoint(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  write(checkpoint: ProjectSyncCheckpointV1): void {
    this.storage.setItem(partitionKeysFor(checkpoint.ownerUserIdHash).checkpointKey, JSON.stringify(checkpoint));
  }

  clear(partitionHash: string): void {
    this.storage.removeItem(partitionKeysFor(partitionHash).checkpointKey);
  }
}

export const createPartitionedProjectStorage = (
  partitionHash: string,
  storage: CheckpointLikeStorage = globalThis.localStorage as Storage,
): ProjectStorage => new LocalProjectStorage(partitionKeysFor(partitionHash).projectKey, storage as Storage);

/** Type guard helper re-exported for tests. */
export const asRoomProject = (value: RoomProject): RoomProject => value;
