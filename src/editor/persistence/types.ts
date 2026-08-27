/** H3B local-first sync state and persistent checkpoint types.
 *  Sync metadata lives OUTSIDE RoomProject, EditorSession, undo/redo and any
 *  planner structures. The checkpoint is the crash-safety authority: dirty is
 *  always derived from a full canonical document hash versus lastSyncedHash,
 *  never from a stored boolean. */

import type { RemoteFailureKind } from './remoteProjectRepository';

export type ProjectSyncState =
  | { status: 'local-only' }
  | { status: 'clean'; projectId: string; revision: number }
  | { status: 'dirty'; projectId: string; revision?: number }
  | { status: 'saving'; projectId: string; revision?: number }
  | {
      status: 'unsynced';
      projectId?: string;
      revision?: number;
      reason: RemoteFailureKind | 'local-storage';
    }
  | {
      status: 'conflict';
      projectId: string;
      baseRevision: number;
      serverRevision?: number;
      reason: 'stale_revision' | 'remote_missing' | 'revision_diverged' | 'create_conflict';
    };

export interface ProjectSyncConflict {
  reason: 'stale_revision' | 'remote_missing' | 'revision_diverged' | 'create_conflict';
  serverRevision?: number;
}

export interface ProjectSyncCheckpointV1 {
  version: 1;
  /** Local account-partition guard only. Never sent to the server. */
  ownerUserIdHash: string;
  projectId: string;
  revision: number | null;
  /** Canonical document hash of the latest state known to be synced (or the
   *  pending-create snapshot while revision is still null). */
  lastSyncedHash: string | null;
  pendingCreateHash?: string;
  conflict?: ProjectSyncConflict;
}
