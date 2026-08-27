/** H3B local-first sync controller.
 *
 *  Owns the bridge between editor persistence and the App API project routes:
 *  - first cloud attachment happens ONLY through an explicit Save;
 *  - authentication alone never uploads anything;
 *  - account mismatch never opens or uploads another owner's project;
 *  - matched owner caches are restored into the editor BEFORE reconciliation;
 *  - a missing local cache makes GET the recovery source (never "dirty default");
 *  - identity loss/switch detaches bindings and returns the editor to the
 *    anonymous draft so attached content cannot leak across accounts;
 *  - startup/lost-response reconciliation follows the frozen matrix;
 *  - all sends go through the single-flight coalescing queue. */

import type { RoomProject } from '@/editor/model/types';
import { createDefaultProject } from '@/editor/model/types';
import { hashRoomProjectDocument } from '@/editor/serialization/projectDocument';
import { storage, type ProjectStorage } from '@/editor/serialization/project';
import {
  ProjectSyncCheckpointStore,
  createPartitionedProjectStorage,
  ownerPartitionHash,
} from './projectSyncCheckpoint';
import { ProjectSyncQueue, type QueueConflictReason } from './projectSyncQueue';
import {
  createRemoteProject,
  fetchRemoteProject,
  updateRemoteProject,
  type RemoteProjectMetadata,
} from './remoteProjectRepository';
import { resolveAppApiEndpoint, toAppApiBaseUrl } from '@/platform/appApi/endpoint';
import { getIdentitySnapshot, subscribeIdentity } from '@/platform/identity/store';
import { useEditorStore } from '@/editor/state/store';
import { attachPersistenceObserver, setActiveProjectStorage } from '@/editor/state/store';
import type { ProjectSyncCheckpointV1, ProjectSyncState } from './types';

export interface RemoteTransport {
  create: (baseUrl: string, projectId: string, project: RoomProject) => Promise<import('./remoteProjectRepository').RemoteResult<RemoteProjectMetadata>>;
  get: (baseUrl: string, projectId: string) => Promise<import('./remoteProjectRepository').RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>>;
  update: (baseUrl: string, projectId: string, expectedRevision: number, project: RoomProject) => Promise<import('./remoteProjectRepository').RemoteResult<RemoteProjectMetadata>>;
}

const defaultTransport: RemoteTransport = {
  create: (base, id, project) => createRemoteProject(base, id, project),
  get: (base, id) => fetchRemoteProject(base, id),
  update: (base, id, expected, project) => updateRemoteProject(base, id, expected, project),
};

export interface ControllerDeps {
  getBaseUrl: () => string | null;
  getUserId: () => string | undefined;
  getCurrentProject: () => RoomProject;
  hydrateEditor: (project: RoomProject) => void;
  draftStorage: ProjectStorage;
  checkpoints?: ProjectSyncCheckpointStore;
  /** Test seam: override HTTP transport. */
  remote?: RemoteTransport;
  /** Backend for owner-partition storage/checkpoints (defaults to localStorage). */
  storageBackend?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Test seam: override document hash (defaults to hashRoomProjectDocument). */
  hashDocument?: (project: RoomProject) => Promise<string>;
}

export class ProjectSyncController {
  private state: ProjectSyncState = { status: 'local-only' };
  private listeners = new Set<() => void>();

  private generation = 0;
  private bindingEpoch = 0;
  private partitionHash: string | null = null;
  private partitionUserId: string | null = null;
  private partitionStorage: ProjectStorage | null = null;
  private projectId: string | null = null;
  private revision: number | null = null;
  private lastSyncedHash: string | null = null;
  private pendingCreateHash: string | null = null;
  /** True when the owner-partition snapshot was restored (or freshly written);
   *  false ⇒ GET is the recovery source and the default/draft editor content
   *  must never be classified as dirty attached state. */
  private localCacheAvailable = false;
  /** Latest snapshot captured while the initial create was in flight; flushed
   *  as the first revision bump once the create is adopted. */
  private postCreateEntry: { generation: number; project: RoomProject } | null = null;
  private reconcileEpoch: number | null = null;

  readonly draftStorage: ProjectStorage;
  private readonly checkpoints: ProjectSyncCheckpointStore;
  private readonly deps: ControllerDeps;
  private readonly remote: RemoteTransport;

  private queue: ProjectSyncQueue;

  private hashOf = (project: RoomProject): Promise<string> => (this.deps.hashDocument ?? hashRoomProjectDocument)(project);

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.draftStorage = deps.draftStorage;
    this.checkpoints = deps.checkpoints ?? new ProjectSyncCheckpointStore(deps.storageBackend ?? (globalThis.localStorage as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>));
    this.remote = deps.remote ?? defaultTransport;
    this.queue = new ProjectSyncQueue({
      sendCreate: async (entry) => {
        const base = this.deps.getBaseUrl();
        if (base === null) return { kind: 'failure', reason: 'disabled' };
        // Binding-bound: use the projectId captured at enqueue time, never mutable this.projectId
        return this.remote.create(base, entry.projectId, entry.project);
      },
      sendUpdate: async (entry, expectedRevision) => {
        const base = this.deps.getBaseUrl();
        if (base === null) return { kind: 'failure', reason: 'disabled' };
        return this.remote.update(base, entry.projectId, expectedRevision, entry.project);
      },
      onAdopted: ({ revision, syncedHash }) => {
        // Guard stale adoption from a previous binding (e.g., A hash completing after switch to B)
        // The queue entry's projectId/bindingEpoch already ensures the request went to the correct project,
        // but we must also not clobber B's binding state if we have since switched.
        // onAdopted is only called for the currently dispatched entry, which was validated at enqueue time,
        // so no extra epoch check needed here beyond the usual writeCheckpoint logic.
        const wasCreate = this.revision === null;
        this.revision = revision;
        this.lastSyncedHash = syncedHash;
        this.localCacheAvailable = true;
        if (this.pendingCreateHash !== null && syncedHash === this.pendingCreateHash) this.pendingCreateHash = null;
        this.writeCheckpoint();
        // Flush a snapshot that was coalesced while the create was in flight.
        if (wasCreate && this.postCreateEntry !== null && this.projectId !== null) {
          const { generation, project } = this.postCreateEntry;
          const pendingEpoch = this.bindingEpoch;
          const pendingProjectId = this.projectId;
          this.postCreateEntry = null;
          void this.hashOf(project).then((hash) => {
            if (pendingEpoch !== this.bindingEpoch) return;
            if (pendingProjectId !== this.projectId) return;
            if (hash === syncedHash || this.queue.isFrozen()) return;
            this.queue.enqueue({ bindingEpoch: pendingEpoch, projectId: pendingProjectId, generation, project, hash }, 'update');
          });
        }
        this.refreshDerivedState();
      },
      onUnsynced: (reason) => {
        this.setState(
          this.projectId !== null
            ? { status: 'unsynced', projectId: this.projectId, revision: this.revision ?? undefined, reason }
            : { status: 'unsynced', reason },
        );
      },
      onConflict: (reason: QueueConflictReason) => {
        this.setState({
          status: 'conflict',
          projectId: this.projectId!,
          baseRevision: this.revision ?? 0,
          reason,
        });
      },
      getExpectedRevision: () => this.revision ?? 1,
    });
  }

  // ---------------------------------------------------------------- observers

  getSnapshot = (): ProjectSyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(next: ProjectSyncState) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private writeCheckpoint = (): void => {
    if (this.partitionHash === null || this.projectId === null) return;
    const checkpoint: ProjectSyncCheckpointV1 = {
      version: 1,
      ownerUserIdHash: this.partitionHash,
      projectId: this.projectId,
      revision: this.revision,
      lastSyncedHash: this.lastSyncedHash,
      ...(this.pendingCreateHash !== null ? { pendingCreateHash: this.pendingCreateHash } : {}),
    };
    this.checkpoints.write(checkpoint);
  };

  private refreshDerivedState() {
    const projectId = this.projectId;
    const revision = this.revision;
    const epoch = this.bindingEpoch;
    if (projectId === null || revision === null || !this.localCacheAvailable) return;
    // Never clobber terminal/attention states (conflict, unsynced, local-only):
    // only clean/dirty/saving participate in derived freshness.
    const status = this.state.status;
    if (status !== 'clean' && status !== 'dirty' && status !== 'saving') return;
    void this.hashOf(this.deps.getCurrentProject()).then((currentHash) => {
      if (epoch !== this.bindingEpoch) return;
      if (projectId !== this.projectId) return;
      if (this.lastSyncedHash === null || currentHash !== this.lastSyncedHash) {
        this.setState({ status: 'dirty', projectId, revision });
      } else {
        this.setState({ status: 'clean', projectId, revision });
      }
    });
  }

  // ------------------------------------------------------------- local edits

  /** Called by the store after every persisted project content change. */
  notifyLocalChange = (project: RoomProject): void => {
    this.generation += 1;
    if (this.projectId === null) {
      // Unbound drafts stay local-only; explicit Save performs attachment.
      return;
    }
    if (this.revision === null) {
      // Initial create still in flight: coalesce latest snapshot, flush it as
      // the first revision bump right after the create is adopted.
      this.postCreateEntry = { generation: this.generation, project };
      return;
    }
    if (this.state.status === 'conflict') return; // frozen; explicit Save recovers
    if (this.state.status === 'unsynced' && this.state.reason === 'unauthenticated') return;
    if (!this.localCacheAvailable) return; // cache-missing recovery owns direction
    const generation = this.generation;
    const epoch = this.bindingEpoch;
    const projectId = this.projectId;
    void this.hashOf(project).then((hash) => {
      if (epoch !== this.bindingEpoch) return;
      if (projectId !== this.projectId) return;
      // Identical snapshot already synced → no-op (guards double enqueues).
      if (hash === this.lastSyncedHash) {
        this.setState({ status: 'clean', projectId: projectId!, revision: this.revision! });
        return;
      }
      this.queue.enqueue({ bindingEpoch: epoch, projectId: projectId!, generation, project, hash }, 'update');
      this.setState({ status: 'saving', projectId: projectId!, revision: this.revision! });
    });
  };

  /** Storage quota/write failure: accepted edit stands, cloud stays behind. */
  notifyLocalStorageFailure = (project: RoomProject): void => {
    this.generation += 1;
    if (this.projectId === null || this.revision === null) return;
    void this.hashOf(project);
    this.setState({ status: 'unsynced', projectId: this.projectId, revision: this.revision, reason: 'local-storage' });
  };

  /** Explicit Save (existing button). Performs first attachment when needed;
   *  for an attached project the persistence observer has ALREADY enqueued the
   *  current snapshot, so this only retries controlled failures / recovers. */

  requestExplicitSave = async (): Promise<void> => {
    const userId = this.deps.getUserId();
    const baseUrl = this.deps.getBaseUrl();
    const project = this.deps.getCurrentProject();
    if (userId === undefined || baseUrl === null) return; // anonymous: local save only

    await this.ensurePartitionHash(userId);

    if (this.projectId === null) {
      await this.attach(project);
      return;
    }

    if (this.state.status === 'conflict') {
      // Controlled recovery attempt: unfreeze, re-reconcile, resume on success.
      this.queue.unfreeze();
      await this.reconcile();
      const statusAfter: string = (this.state as { status: string }).status;
      if (statusAfter === 'clean') this.refreshDerivedState();
      return;
    }

    if (this.state.status === 'unsynced') {
      if (this.state.reason === 'unauthenticated') return;
      if (this.state.reason === 'network' || this.state.reason === 'server') {
        // Pending-create recovery: never PUT before a successful/idempotent CREATE.
        if (this.revision === null && this.pendingCreateHash !== null && this.projectId !== null) {
          const epochBefore = this.bindingEpoch;
          const projectIdBefore = this.projectId;
          const baseForRecovery = this.deps.getBaseUrl();
          if (baseForRecovery === null) return;
          const result = await this.remote.get(baseForRecovery, projectIdBefore);
          if (epochBefore !== this.bindingEpoch) return;
          if (projectIdBefore !== this.projectId) return;
          if (result.kind === 'ok') {
            const remoteHash = await this.hashOf(result.data.project);
            if (epochBefore !== this.bindingEpoch) return;
            if (projectIdBefore !== this.projectId) return;
            if (remoteHash === this.pendingCreateHash) {
              // Lost response: server holds exactly our pending snapshot.
              this.pendingCreateHash = null;
              this.adoptRemote(result.data.metadata, remoteHash);
              const current = this.deps.getCurrentProject();
              const currentHash = await this.hashOf(current);
              if (epochBefore !== this.bindingEpoch) return;
              if (projectIdBefore !== this.projectId) return;
              if (currentHash !== remoteHash) {
                this.generation += 1;
                this.queue.enqueue({ bindingEpoch: epochBefore, projectId: projectIdBefore!, generation: this.generation, project: current, hash: currentHash }, 'update');
                this.setState({ status: 'saving', projectId: projectIdBefore!, revision: this.revision! });
              }
              return;
            }
            // Exists but with unexpected content for same UUID → conflict.
            this.setState({ status: 'conflict', projectId: projectIdBefore, baseRevision: 0, reason: 'create_conflict' });
            return;
          }
          if (result.kind === 'failure' && result.reason === 'not_found') {
            // Genuine missing: retry CREATE with latest current snapshot (same projectId).
            const current = this.deps.getCurrentProject();
            const currentHash = await this.hashOf(current);
            if (epochBefore !== this.bindingEpoch) return;
            if (projectIdBefore !== this.projectId) return;
            this.pendingCreateHash = currentHash;
            this.writeCheckpoint();
            this.partitionStorage?.save(current);
            this.localCacheAvailable = true;
            this.generation += 1;
            this.queue.enqueue({ bindingEpoch: epochBefore, projectId: projectIdBefore!, generation: this.generation, project: current, hash: currentHash }, 'create');
            this.setState({ status: 'saving', projectId: projectIdBefore!, revision: undefined });
            return;
          }
          const reason2 = result.kind === 'failure' ? (result.reason === 'malformed' ? 'server' : result.reason) : 'server';
          this.setState({ status: 'unsynced', projectId: projectIdBefore, revision: undefined, reason: reason2 as 'network' | 'server' | 'unauthenticated' });
          return;
        }
        const epoch = this.bindingEpoch;
        const pid = this.projectId!;
        const hash = await this.hashOf(project);
        if (epoch !== this.bindingEpoch) return;
        if (pid !== this.projectId) return;
        this.generation += 1;
        this.queue.enqueue({ bindingEpoch: epoch, projectId: pid, generation: this.generation, project, hash }, 'update');
        this.setState({ status: 'saving', projectId: pid, revision: this.revision ?? undefined });
        return;
      }
      // local-storage / other unsynced: next mutation re-enqueues; no stale resend here.
      return;
    }

    if (this.state.status === 'dirty' && !this.queue.isIdle()) {
      // A newer snapshot is already in flight/coalesced → no-op.
      return;
    }
    // clean / dirty-idle / saving: the persistence observer has already
    // enqueued the current snapshot for every accepted mutation, so an
    // explicit Save adds nothing new to send here.
  };

  private ensurePartitionHash = async (userId: string): Promise<string> => {
    // Synchronous privacy barrier: detach previous owner BEFORE any async work.
    // Identity store updates user synchronously; SHA-256 is async and would otherwise leave a window.
    if (this.partitionUserId !== null && this.partitionUserId !== userId) {
      this.detachBinding();
      this.partitionHash = null;
      this.partitionUserId = null;
      this.partitionStorage = null;
      setActiveProjectStorage(null);
      const fallback = this.draftStorage.load() ?? createDefaultProject();
      this.deps.hydrateEditor(fallback);
      // Continue to compute new hash; handleIdentityAuthenticated will handle checkpoint logic.
    }
    const epochBefore = this.bindingEpoch;
    const hash = await ownerPartitionHash(userId);
    if (epochBefore !== this.bindingEpoch) {
      // Switched again while hashing new identity — discard stale hash
      return hash;
    }
    if (this.partitionHash !== null && this.partitionHash !== hash) {
      this.detachBinding();
      // Close privacy window: active must not stay on previous owner's partition
      this.partitionStorage = null;
      setActiveProjectStorage(null);
    }
    if (this.partitionHash === hash && this.partitionUserId === userId) return hash;
    this.partitionHash = hash;
    this.partitionUserId = userId;
    return hash;
  };

  /** First binding: migrate the document into the owner partition BEFORE any
   *  network call, write the pending-create checkpoint, then clear the shared
   *  draft copy so no private snapshot remains device-readable there. */
  private attach = async (project: RoomProject): Promise<void> => {
    if (this.partitionHash === null || this.partitionUserId === null) return;
    if (!this.partitionStorage) {
      this.partitionStorage = createPartitionedProjectStorage(this.partitionHash, this.deps.storageBackend ?? (globalThis.localStorage as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>));
      setActiveProjectStorage(this.partitionStorage);
    }
    const epoch = this.bindingEpoch;
    const partitionHash = this.partitionHash;
    const projectId = crypto.randomUUID();
    const hash = await this.hashOf(project);
    if (epoch !== this.bindingEpoch) return;
    if (partitionHash !== this.partitionHash) return;

    this.partitionStorage.save(project); // safe copy in owner partition
    this.localCacheAvailable = true;
    const checkpoint: ProjectSyncCheckpointV1 = {
      version: 1,
      ownerUserIdHash: this.partitionHash,
      projectId,
      revision: null,
      lastSyncedHash: null,
      pendingCreateHash: hash,
    };
    this.checkpoints.write(checkpoint); // crash-safe marker before network
    this.draftStorage.clear(); // shared draft no longer holds the document

    this.projectId = projectId;
    this.revision = null;
    this.lastSyncedHash = null;
    this.pendingCreateHash = hash;
    this.setState({ status: 'saving', projectId, revision: undefined });
    this.generation += 1;
    this.queue.enqueue({ bindingEpoch: epoch, projectId, generation: this.generation, project, hash }, 'create');
  };

  // ---------------------------------------------------------------- identity

  handleIdentityAuthenticated = async (userId: string): Promise<void> => {
    await this.ensurePartitionHash(userId);
    if (this.partitionHash === null) return;
    const checkpoint = this.checkpoints.read(this.partitionHash);
    if (checkpoint === null || checkpoint.ownerUserIdHash !== this.partitionHash) {
      // No binding for THIS account: never open another owner's cached copy.
      // Keep partitionHash for future attach, but ensure active is draft.
      this.queue.invalidate();
      this.queue.unfreeze();
      this.projectId = null;
      this.revision = null;
      this.lastSyncedHash = null;
      this.pendingCreateHash = null;
      this.postCreateEntry = null;
      this.localCacheAvailable = false;
      this.partitionStorage = null;
      setActiveProjectStorage(null);
      // Privacy: bounce editor back to anonymous draft/default so A's
      // attached document does not remain visible under B.
      const fallback = this.draftStorage.load() ?? createDefaultProject();
      this.deps.hydrateEditor(fallback);
      this.setState({ status: 'local-only' });
      return;
    }
    // Matched checkpoint: activate owner partition
    this.partitionStorage = createPartitionedProjectStorage(this.partitionHash, this.deps.storageBackend ?? (globalThis.localStorage as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>));
    setActiveProjectStorage(this.partitionStorage);

    this.projectId = checkpoint.projectId;
    this.revision = checkpoint.revision;
    this.lastSyncedHash = checkpoint.lastSyncedHash;
    this.pendingCreateHash = checkpoint.pendingCreateHash ?? null;

    // P1-1: restore the owner-partition snapshot BEFORE reconciliation so the
    // editor reflects the attached document, never a default/draft fallback.
    const cached = this.partitionStorage.load();
    if (cached !== null) {
      this.deps.hydrateEditor(cached);
      this.localCacheAvailable = true;
    } else {
      // No local copy: GET becomes the recovery source; default/draft content
      // must never be treated as dirty attached state.
      this.localCacheAvailable = false;
    }
    const reconcileEpoch = this.bindingEpoch;
    const reconcileProjectId = this.projectId;
    const reconcileHash = this.partitionHash;
    await this.reconcile();
    if (reconcileEpoch !== this.bindingEpoch) return;
    if (reconcileProjectId !== this.projectId) return;
    if (reconcileHash !== this.partitionHash) return;
  };

  /** Detaches cloud binding without touching editor content. Increments bindingEpoch to invalidate all stale async work. */
  private detachBinding = (): void => {
    this.bindingEpoch += 1;
    this.queue.invalidate();
    this.queue.unfreeze();
    this.projectId = null;
    this.revision = null;
    this.lastSyncedHash = null;
    this.pendingCreateHash = null;
    this.postCreateEntry = null;
    this.localCacheAvailable = false;
    this.reconcileEpoch = null;
  };

  handleIdentityLost = (): void => {
    this.detachBinding();
    this.partitionHash = null;
    this.partitionUserId = null;
    this.partitionStorage = null;
    setActiveProjectStorage(null);
    // Privacy: the attached private document leaves the editor. Restore the
    // anonymous draft if one exists, otherwise the default project — without
    // copying attached content into the shared draft key.
    const fallback = this.draftStorage.load() ?? createDefaultProject();
    this.deps.hydrateEditor(fallback);
    this.setState({ status: 'local-only' });
  };

  // ------------------------------------------------------------- reconciliation

  reconcile = async (): Promise<void> => {
    if (this.projectId === null || this.partitionHash === null) return;
    const epoch = this.bindingEpoch;
    if (this.reconcileEpoch === epoch) return;
    this.reconcileEpoch = epoch;
    const baseUrl = this.deps.getBaseUrl();
    if (baseUrl === null) {
      if (this.reconcileEpoch === epoch) this.reconcileEpoch = null;
      return;
    }
    const epochBefore = epoch;
    const projectIdBefore = this.projectId;
    const partitionHashBefore = this.partitionHash;
    try {
      const generationBefore = this.generation;
      const result = await this.remote.get(baseUrl, projectIdBefore);
      if (epochBefore !== this.bindingEpoch) return;
      if (projectIdBefore !== this.projectId) return;
      if (partitionHashBefore !== this.partitionHash) return;
      if (generationBefore !== this.generation) return; // local changed during GET
      if (result.kind === 'failure') {
        if (result.reason === 'not_found') {
          this.setState({
            status: 'conflict',
            projectId: this.projectId,
            baseRevision: this.revision ?? 0,
            reason: 'remote_missing',
          });
        } else {
          const reason = result.reason === 'malformed' ? 'server' : result.reason;
          this.setState({ status: 'unsynced', projectId: this.projectId, revision: this.revision ?? undefined, reason: reason as 'network' | 'server' | 'unauthenticated' });
        }
        return;
      }

      const { metadata: remoteMetadata, project: remoteProject } = result.data;
      const remoteHash = await this.hashOf(remoteProject);
      if (epochBefore !== this.bindingEpoch) return;
      if (projectIdBefore !== this.projectId) return;
      if (partitionHashBefore !== this.partitionHash) return;
      if (generationBefore !== this.generation) return;

      // Cache-missing recovery: GET is authoritative; default/draft editor
      // content is NEVER pushed over the real cloud document.
      if (!this.localCacheAvailable) {
        if (epochBefore !== this.bindingEpoch) return;
        if (projectIdBefore !== this.projectId) return;
        this.deps.hydrateEditor(remoteProject);
        this.partitionStorage?.save(remoteProject);
        this.localCacheAvailable = true;
        this.pendingCreateHash = null;
        this.adoptRemote(remoteMetadata, remoteHash);
        return;
      }

      const localProject = this.deps.getCurrentProject();
      const [localHash] = await Promise.all([this.hashOf(localProject)]);
      if (epochBefore !== this.bindingEpoch) return;
      if (projectIdBefore !== this.projectId) return;
      if (partitionHashBefore !== this.partitionHash) return;
      if (generationBefore !== this.generation) return;

      const baseRevision = this.checkpoints.read(this.partitionHash!)?.revision ?? this.revision ?? 0;
      const localDirty = this.lastSyncedHash !== null && localHash !== this.lastSyncedHash;

      // Lost-create response: server holds exactly our pending create snapshot.
      if (this.pendingCreateHash !== null && remoteHash === this.pendingCreateHash) {
        this.pendingCreateHash = null;
        this.writeCheckpoint();
        this.adoptRemote(remoteMetadata, remoteHash);
        if (localHash !== remoteHash) {
          if (epochBefore !== this.bindingEpoch) return;
          if (projectIdBefore !== this.projectId) return;
          this.generation += 1;
          this.queue.enqueue({ bindingEpoch: epochBefore, projectId: projectIdBefore!, generation: this.generation, project: localProject, hash: localHash }, 'update');
        }
        return;
      }

      if (localHash === remoteHash) {
        this.adoptRemote(remoteMetadata, remoteHash);
        return;
      }

      if (remoteMetadata.revision === baseRevision) {
        if (!localDirty && this.lastSyncedHash !== null && remoteHash !== this.lastSyncedHash) {
          // Same revision, different content, local believed clean → diverged.
          this.setState({ status: 'conflict', projectId: this.projectId, baseRevision, serverRevision: remoteMetadata.revision, reason: 'revision_diverged' });
          return;
        }
        // Local dirty against unchanged base → push latest local snapshot.
        if (epochBefore !== this.bindingEpoch) return;
        if (projectIdBefore !== this.projectId) return;
        this.generation += 1;
        this.queue.enqueue({ bindingEpoch: epochBefore, projectId: projectIdBefore!, generation: this.generation, project: localProject, hash: localHash }, 'update');
        this.setState({ status: 'saving', projectId: projectIdBefore!, revision: this.revision ?? baseRevision });
        return;
      }

      if (remoteMetadata.revision > baseRevision) {
        if (!localDirty) {
          // Clean local, newer remote → hydrate remote without upload loop.
          this.deps.hydrateEditor(remoteProject);
          this.partitionStorage?.save(remoteProject);
          this.adoptRemote(remoteMetadata, remoteHash);
          return;
        }
        this.setState({
          status: 'conflict',
          projectId: this.projectId,
          baseRevision,
          serverRevision: remoteMetadata.revision,
          reason: 'stale_revision',
        });
        return;
      }

      // remote older than base while hashes differ → diverged histories
      this.setState({
        status: 'conflict',
        projectId: this.projectId,
        baseRevision,
        serverRevision: remoteMetadata.revision,
        reason: 'revision_diverged',
      });
    } finally {
      if (this.reconcileEpoch === epoch) this.reconcileEpoch = null;
    }
  };

  private adoptRemote(metadata: { revision: number }, syncedHash: string) {
    this.revision = metadata.revision;
    this.lastSyncedHash = syncedHash;
    this.writeCheckpoint();
    if (this.projectId === null) return;
    this.setState({ status: 'clean', projectId: this.projectId, revision: metadata.revision });
  }
}

let singleton: ProjectSyncController | null = null;

/** Wires the singleton controller to the real store/identity/app-api stack.
 *  Safe to call once during bootstrap; subsequent calls are no-ops. */
export const initProjectSync = (): void => {
  if (singleton !== null) return;

  const instance = new ProjectSyncController({
    getBaseUrl: () => {
      const endpoint = resolveAppApiEndpoint();
      return endpoint === null ? null : toAppApiBaseUrl(endpoint);
    },
    getUserId: () => getIdentitySnapshot().userId,
    getCurrentProject: () => useEditorStore.getState().project,
    hydrateEditor: (project) => useEditorStore.getState().hydrateRemote(project),
    draftStorage: storage,
  });
  singleton = instance;

  attachPersistenceObserver((project, error) => {
    if (error !== undefined) instance.notifyLocalStorageFailure(project);
    else instance.notifyLocalChange(project);
  });

  subscribeIdentity((snapshot) => {
    if (snapshot.state === 'authenticated' && snapshot.userId !== undefined) {
      void instance.handleIdentityAuthenticated(snapshot.userId);
    } else if (snapshot.state === 'anonymous') {
      instance.handleIdentityLost();
    }
  });
};

/** Explicit-Save entry point used by the project menu. No-op until bootstrap
 *  has started; anonymous sessions keep purely local behavior. */
export const requestExplicitSave = (): Promise<void> => {
  if (singleton === null) return Promise.resolve();
  return singleton.requestExplicitSave();
};
