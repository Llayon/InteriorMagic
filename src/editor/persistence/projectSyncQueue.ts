/** Single-flight coalescing save queue (H3B).
 *
 *  Guarantees:
 *  - at most one network request in flight;
 *  - at most one pending latest snapshot (latest-wins);
 *  - late/foreign-epoch responses are dropped by the controller via generation
 *    checks (the queue exposes the dispatched generation with each outcome);
 *  - success for an old snapshot never marks newer local content clean;
 *  - failures map to controlled outcomes; conflicts freeze automatic sends.
 *
 *  The queue is transport-agnostic: the controller injects senders and reacts
 *  to outcomes, keeping this file free of fetch/D1 concerns. */

import type { RoomProject } from '@/editor/model/types';
import type { RemoteProjectMetadata, RemoteResult } from './remoteProjectRepository';

export interface QueueEntry {
  bindingEpoch: number;
  projectId: string;
  generation: number;
  project: RoomProject;
  hash: string;
}

export interface QueueAdoption {
  revision: number;
  /** Hash of the snapshot that was actually sent and acknowledged. */
  syncedHash: string;
}

export type QueueConflictReason = 'stale_revision' | 'remote_missing' | 'create_conflict';

export interface QueueCallbacks {
  sendCreate: (entry: QueueEntry) => Promise<RemoteResult<RemoteProjectMetadata>>;
  sendUpdate: (entry: QueueEntry, expectedRevision: number) => Promise<RemoteResult<RemoteProjectMetadata>>;
  onAdopted: (adoption: QueueAdoption) => void;
  onUnsynced: (reason: 'network' | 'server' | 'unauthenticated') => void;
  onConflict: (reason: QueueConflictReason) => void;
  getExpectedRevision: () => number;
}

type DispatchKind = 'create' | 'update';

interface Dispatch {
  kind: DispatchKind;
  entry: QueueEntry;
}

export class ProjectSyncQueue {
  private dispatch: Dispatch | null = null;
  private pending: QueueEntry | null = null;
  private frozenByConflict = false;
  private highestGenerationSeen = -1;

  constructor(private readonly callbacks: QueueCallbacks) {}

  isIdle(): boolean {
    return this.dispatch === null && this.pending === null;
  }

  isFrozen(): boolean {
    return this.frozenByConflict;
  }

  unfreeze(): void {
    this.frozenByConflict = false;
  }

  invalidate(): void {
    // Outcomes of an in-flight request may still arrive; the controller drops
    // them via its own epoch/generation guard.
    this.dispatch = null;
    this.pending = null;
    this.frozenByConflict = false;
    this.highestGenerationSeen = -1;
  }

  enqueue(entry: QueueEntry, kind: DispatchKind): void {
    if (entry.generation < this.highestGenerationSeen) return;
    this.highestGenerationSeen = entry.generation;
    if (this.frozenByConflict) return;
    if (this.dispatch !== null) {
      const newestSeen = Math.max(this.dispatch.entry.generation, this.pending?.generation ?? -1);
      if (entry.generation >= newestSeen || this.pending === null) {
        if (entry.generation >= newestSeen) this.pending = entry;
      }
      return;
    }
    this.start({ kind, entry });
  }

  private start(dispatch: Dispatch): void {
    this.dispatch = dispatch;
    const expectedRevision = dispatch.kind === 'create' ? 0 : this.callbacks.getExpectedRevision();
    const sender =
      dispatch.kind === 'create'
        ? this.callbacks.sendCreate(dispatch.entry)
        : this.callbacks.sendUpdate(dispatch.entry, expectedRevision);
    void sender.then((result) => this.settle(dispatch, result));
  }

  private settle(dispatch: Dispatch, result: RemoteResult<RemoteProjectMetadata>): void {
    // Only the most recent dispatch may settle; a superseded one is ignored.
    if (this.dispatch !== dispatch) return;
    this.dispatch = null;

    if (result.kind === 'ok') {
      this.callbacks.onAdopted({ revision: result.data.revision, syncedHash: dispatch.entry.hash });
      if (this.pending !== null) {
        const next = this.pending;
        this.pending = null;
        this.start({ kind: 'update', entry: next });
      }
      return;
    }

    const reason = result.reason;
    if (reason === 'conflict_stale_revision') {
      this.frozenByConflict = true;
      this.pending = null;
      this.callbacks.onConflict('stale_revision');
      return;
    }
    if (reason === 'not_found') {
      this.frozenByConflict = true;
      this.pending = null;
      this.callbacks.onConflict('remote_missing');
      return;
    }
    if (reason === 'conflict_id') {
      this.frozenByConflict = true;
      this.pending = null;
      this.callbacks.onConflict('create_conflict');
      return;
    }
    if (reason === 'unauthenticated') {
      // Pause: drop pending so a stale snapshot cannot start after re-auth.
      this.pending = null;
      this.callbacks.onUnsynced('unauthenticated');
      return;
    }
    if (reason === 'server') {
      this.pending = null;
      this.callbacks.onUnsynced('server');
      return;
    }
    // network / malformed: retain local state; the next edit or explicit save
    // naturally retries. Pending is cleared so a NEWER snapshot enqueued later
    // can never be followed by this older one (no remote rollback).
    this.pending = null;
    this.callbacks.onUnsynced(reason === 'network' ? 'network' : 'server');
  }
}
