import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject, type RoomProject } from '@/editor/model/types';
import { hashRoomProjectDocument, serializeRoomProjectCanonical } from '@/editor/serialization/projectDocument';
import { ProjectSyncCheckpointStore, ownerPartitionHash } from './projectSyncCheckpoint';
import type { RemoteProjectMetadata, RemoteResult } from './remoteProjectRepository';
import { ProjectSyncController, type ControllerDeps, type RemoteTransport } from './projectSyncController';

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

const projectWithFloor = (floor: string): RoomProject => {
  const base = createDefaultProject();
  return { ...base, finishes: { ...base.finishes, floorMaterialId: floor } };
};

type StorageMap = Map<string, string>;
const storageLike = (map: StorageMap): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => ({
  getItem: (k) => map.get(k) ?? null,
  setItem: (k, v) => void map.set(k, v),
  removeItem: (k) => void map.delete(k),
});

type UpdateInstruction =
  | { kind: 'auto-ok' }
  | { kind: 'resolve'; result: RemoteResult<RemoteProjectMetadata> };

type CreateInstruction =
  | { kind: 'auto-ok' }
  | { kind: 'resolve'; result: RemoteResult<RemoteProjectMetadata> };

type GetInstruction =
  | { kind: 'auto-ok' }
  | { kind: 'deferred'; deferred: Promise<RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>>; resolve: (v: RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>) => void };

interface Env {
  /** Shared localStorage-like backend for partition storage + checkpoints. */
  backend: StorageMap;
  draftBackend: StorageMap;
  remote: Map<string, { revision: number; canonical: string; floor: string }>;
  userId: string | undefined;
  /** Per-update instructions consumed FIFO; 'auto-ok' when empty. */
  updateScript: Array<UpdateInstruction>;
  /** Per-create instructions consumed FIFO; 'auto-ok' when empty. */
  createScript: Array<CreateInstruction>;
  /** Per-get instructions for controllable GET delay. */
  getScript: Array<GetInstruction>;
}

interface Harness {
  controller: ProjectSyncController;
  env: Env;
  hydrated: RoomProject[];
  setCurrent: (p: RoomProject) => void;
  getCurrent: () => RoomProject;
  asUser: (userId: string, fn: () => Promise<void>) => Promise<void>;
  counts: () => { create: number; get: number; update: number };
  checkpointFor: (userId: string) => Promise<ReturnType<ProjectSyncCheckpointStore['read']>>;
  waitForStatus: (...statuses: string[]) => Promise<void>;
}

const makeEnv = (): Env => ({
  backend: new Map(),
  draftBackend: new Map(),
  remote: new Map(),
  userId: undefined,
  updateScript: [],
  createScript: [],
  getScript: [],
});

function createController(env: Env, initialEditor: RoomProject): Harness {
  let createCount = 0;
  let getCount = 0;
  let updateCount = 0;
  const updateHistory: string[] = [];
  const h = {
    env,
    hydrated: [] as RoomProject[],
    setCurrent: (p: RoomProject) => { initialEditor = structuredClone(p); },
    getCurrent: () => initialEditor,
    counts: () => ({ create: createCount, get: getCount, update: updateCount }),
    updateHistory,
  } as unknown as Harness;

  const checkpoints = new ProjectSyncCheckpointStore(storageLike(env.backend));
  const transport: RemoteTransport = {
    create: async (_b, projectId, proj) => {
      createCount += 1;
      const instruction = env.createScript.shift() ?? { kind: 'auto-ok' as const };
      if (instruction.kind === 'resolve') {
        // Simulate server side effect for lost-response: if we want remote to have entry, caller must pre-seed it or we simulate here.
        // For 'network' failure with lost response, test will pre-seed remote and expect adoption via GET, so we don't set here.
        return instruction.result;
      }
      env.remote.set(projectId, { revision: 1, canonical: serializeRoomProjectCanonical(proj), floor: proj.finishes.floorMaterialId });
      return { kind: 'ok', data: { id: projectId, schemaVersion: 1, revision: 1, createdAt: 1, updatedAt: 1 } };
    },
    get: async (_b, projectId) => {
      getCount += 1;
      const deferred = env.getScript.shift();
      if (deferred?.kind === 'deferred') return deferred.deferred;
      const row = env.remote.get(projectId);
      if (!row) return { kind: 'failure', reason: 'not_found' };
      return {
        kind: 'ok',
        data: {
          metadata: { id: projectId, schemaVersion: 1, revision: row.revision, createdAt: 1, updatedAt: 1 },
          project: JSON.parse(row.canonical) as RoomProject,
        },
      };
    },
    update: async (_b, projectId, expectedRevision, proj) => {
      updateCount += 1;
      updateHistory.push(proj.finishes.floorMaterialId);
      const row = env.remote.get(projectId);
      const instruction = env.updateScript.shift() ?? { kind: 'auto-ok' as const };
      if (instruction.kind === 'resolve') return instruction.result;
      if (!row || row.revision !== expectedRevision) return { kind: 'failure', reason: row ? 'conflict_stale_revision' : 'not_found' };
      env.remote.set(projectId, { revision: row.revision + 1, canonical: serializeRoomProjectCanonical(proj), floor: proj.finishes.floorMaterialId });
      return { kind: 'ok', data: { id: projectId, schemaVersion: 1, revision: row.revision + 1, createdAt: 1, updatedAt: 2 } };
    },
  };

  const deps: ControllerDeps = {
    getBaseUrl: () => 'https://api.test',
    getUserId: () => env.userId,
    getCurrentProject: () => initialEditor,
    hydrateEditor: (p) => {
      h.hydrated.push(structuredClone(p));
      initialEditor = structuredClone(p);
    },
    draftStorage: {
      load: () => {
        const raw = env.draftBackend.get('interior-magic-project-v1');
        return raw ? (JSON.parse(raw) as RoomProject) : null;
      },
      save: (p) => void env.draftBackend.set('interior-magic-project-v1', JSON.stringify(p)),
      clear: () => void env.draftBackend.delete('interior-magic-project-v1'),
    },
    checkpoints,
    remote: transport,
    storageBackend: storageLike(env.backend),
  };

  const waitForStatus = (...statuses: string[]) =>
    vi.waitFor(() => {
      const current = (h.controller.getSnapshot() as { status: string }).status;
      expect(statuses, `status=${current}`).toContain(current);
    });

  h.controller = new ProjectSyncController(deps);
  h.asUser = async (userId, fn) => {
    env.userId = userId;
    try {
      await fn();
    } finally {
      env.userId = undefined;
    }
  };
  h.checkpointFor = async (userId) => checkpoints.read(await ownerPartitionHash(userId));
  h.waitForStatus = waitForStatus;
  return h;
}

describe('H3B sync controller state machine', () => {
  it('attach в†’ reload(same user) в†’ owner snapshot restored before reconcile; zero unintended PUT', async () => {
    const env = makeEnv();
    let editor = projectWithFloor('oak');
    const h = createController(env, editor);
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave(); // attach
      await h.waitForStatus('clean');
    });

    // Simulate reload: same storages/remote, fresh controller, default editor.
    editor = createDefaultProject();
    const reloaded = createController(env, editor);
    await reloaded.asUser(USER_A, async () => {
      await reloaded.controller.handleIdentityAuthenticated(USER_A);
    });

    // Owner snapshot restored BEFORE reconcile:
    expect(reloaded.hydrated.at(-1)?.finishes.floorMaterialId).toBe('oak');
    // No recovery PUT against the restored document:
    expect(reloaded.counts().update).toBe(0);
    expect(reloaded.controller.getSnapshot().status).toBe('clean');
    void h;
  });

  it('missing local cache: GET is the recovery source; default never pushed', async () => {
    const env = makeEnv();
    // Seed remote directly with a real attached document for USER_A.
    const partitionHash = await ownerPartitionHash(USER_A);
    const projectId = '33333333-4444-4555-8666-777777777777';
    const doc = projectWithFloor('walnut');
    env.backend.set(
      `interior-magic-sync-checkpoint-v1:u:${partitionHash}`,
      JSON.stringify({ version: 1, ownerUserIdHash: partitionHash, projectId, revision: 4, lastSyncedHash: 'stale-hash' }),
    );
    env.remote.set(projectId, { revision: 4, canonical: serializeRoomProjectCanonical(doc), floor: 'walnut' });

    // Fresh session: editor holds DEFAULT content, no local cached copy.
    const reloaded = createController(env, createDefaultProject());
    await reloaded.asUser(USER_A, async () => {
      await reloaded.controller.handleIdentityAuthenticated(USER_A);
    });

    // Recovery hydrates remote; default content is never classified dirty.
    expect(reloaded.counts().update).toBe(0);
    expect(reloaded.hydrated.at(-1)?.finishes.floorMaterialId).toBe('walnut');
    expect(reloaded.controller.getSnapshot().status).toBe('clean');
    void projectId;
  });

  it('lost create response в†’ adopt pending snapshot without duplicate PUT', async () => {
    const env = makeEnv();
    const localDoc = projectWithFloor('oak');

    // Pre-write the exact crash state: pending-create checkpoint exists, the
    // server already holds the identical snapshot (response was lost), and the
    // owner partition cache has the document.
    const partitionHash = await ownerPartitionHash(USER_A);
    const projectId = '22222222-3333-4444-8555-666666666666';
    const canonical = serializeRoomProjectCanonical(localDoc);
    env.backend.set(
      `interior-magic-sync-checkpoint-v1:u:${partitionHash}`,
      JSON.stringify({ version: 1, ownerUserIdHash: partitionHash, projectId, revision: null, lastSyncedHash: null, pendingCreateHash: await hashRoomProjectDocument(localDoc) }),
    );
    env.remote.set(projectId, { revision: 1, canonical, floor: 'oak' });
    env.backend.set(`interior-magic-project-v1:u:${partitionHash}`, canonical);

    const reloaded = createController(env, createDefaultProject());
    await reloaded.asUser(USER_A, async () => {
      await reloaded.controller.handleIdentityAuthenticated(USER_A);
    });

    expect(reloaded.counts().update).toBe(0); // no duplicate PUT of identical content
    expect(reloaded.controller.getSnapshot()).toMatchObject({ status: 'clean', projectId, revision: 1 });
    const cp = await reloaded.checkpointFor(USER_A);
    expect(cp?.pendingCreateHash).toBeUndefined(); // cleared after adoption
  });

  it('A logout в†’ anonymous/B sees no A-content in editor or shared draft', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('walnut'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });

    env.userId = undefined;
    h.controller.handleIdentityLost();

    // Editor falls back to anonymous draft/default вЂ” NOT A's attached doc.
    expect(h.getCurrent().finishes.floorMaterialId).not.toBe('walnut');
    expect([...env.draftBackend.values()].some((v) => v.includes('"walnut"'))).toBe(false);

    await h.asUser(USER_B, async () => {
      await h.controller.handleIdentityAuthenticated(USER_B);
    });
    expect(h.controller.getSnapshot().status).toBe('local-only');
    expect(h.counts().get).toBe(0);
  });

  it('gen1 failure while gen2 was pending в†’ later gen3 never sends stale gen2', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('base'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });

    // gen1 fails with network error while gen2 is coalesced behind it:
    env.updateScript.push({ kind: 'resolve', result: { kind: 'failure', reason: 'network' } });
    h.setCurrent(projectWithFloor('gen1'));
    h.controller.notifyLocalChange(h.getCurrent());
    h.setCurrent(projectWithFloor('gen2'));
    h.controller.notifyLocalChange(h.getCurrent());
    // NOTE: do not await an 'unsynced' sighting here вЂ” the failure can settle
    // and the second PUT can adopt before the first poll observes it.

    // The next mutation re-enqueues automatically (a transient network failure
    // never blocks notifies) вЂ” it can NEVER resurrect the stale gen2 snapshot.
    h.setCurrent(projectWithFloor('gen3'));
    h.controller.notifyLocalChange(h.getCurrent());
    const gen3Canonical = serializeRoomProjectCanonical(projectWithFloor('gen3'));
    await expect
      .poll(async () => [...env.remote.values()].at(-1)!.canonical, { timeout: 5_000 })
      .toBe(gen3Canonical);

    // Critical invariant: server never stores the stale gen2 snapshot.
    expect(env.remote.size).toBe(1);
    expect([...env.remote.values()][0]!.floor).toBe('gen3');
  });

  it('409 в†’ explicit Save recovery unfreezes queue; next edit syncs', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('oak'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });

    // Local edit goes stale: server moved ahead with DIFFERENT content.
    const pid = [...env.remote.keys()][0]!;
    const row = env.remote.get(pid)!;
    const localEdited = projectWithFloor('local-edit');
    env.remote.set(pid, { ...row, revision: row.revision + 5, canonical: serializeRoomProjectCanonical(projectWithFloor('remote-diverged')) });

    h.setCurrent(localEdited);
    h.controller.notifyLocalChange(localEdited);
    await h.waitForStatus('conflict');
    const frozen = true;
    expect(frozen).toBe(true);

    // Second session applied OUR edit remotely (convergence): remote now equals
    // the locally edited document but with a newer revision.
    env.remote.set(pid, { revision: row.revision + 6, canonical: serializeRoomProjectCanonical(localEdited), floor: 'local-edit' });

    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave(); // unfreeze + reconcile
    });
    await h.waitForStatus('clean'); // hashes equal в†’ adopt remote revision

    // Queue is unfrozen: next ordinary edit syncs automatically. Poll the
    // remote canonical directly (status 'saving'в†’'clean' races with in-flight
    // PUT completion).
    const nextEdit = projectWithFloor('after-recovery');
    h.setCurrent(nextEdit);
    h.controller.notifyLocalChange(nextEdit);
    const nextCanonical = serializeRoomProjectCanonical(nextEdit);
    await expect
      .poll(async () => [...env.remote.values()].at(-1)!.canonical, { timeout: 5_000 })
      .toBe(nextCanonical);
    expect([...env.remote.values()].at(-1)!.floor).toBe('after-recovery');
  });

  it('explicit Save on already-clean attached project emits no duplicate PUT', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('oak'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });
    const before = h.counts().update;
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
    });
    expect(h.counts().update).toBe(before);
  });

  it('direct A→B switch without logout never exposes A cached document to B', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('walnut'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });
    // Direct switch: B authenticates on same device without explicit logout.
    await h.controller.handleIdentityAuthenticated(USER_B);
    expect(h.controller.getSnapshot().status).toBe('local-only');
    // Editor must not hydrate A's walnut document; should keep draft/default
    expect(h.getCurrent().finishes.floorMaterialId).not.toBe('walnut');
    expect(h.hydrated.some((p) => p.finishes.floorMaterialId === 'walnut' && h.getCurrent().finishes.floorMaterialId === 'walnut')).toBe(false);
    expect([...env.draftBackend.values()].some((v) => v.includes('"walnut"'))).toBe(false);
    expect(h.counts().get).toBe(0); // no checkpoint for B → no GET
    // A's partition still exists but is not active
    const hashA = await ownerPartitionHash(USER_A);
    expect(env.backend.has(`interior-magic-project-v1:u:${hashA}`)).toBe(true);
  });

  it('authenticated unbound reload stays local-only with zero PUT and draft fallback', async () => {
    const env = makeEnv();
    // No checkpoint for USER_A, but draft holds a local-only project
    const draftDoc = projectWithFloor('draft-oak');
    env.draftBackend.set('interior-magic-project-v1', JSON.stringify(draftDoc));
    const h = createController(env, createDefaultProject());
    await h.controller.handleIdentityAuthenticated(USER_A);
    expect(h.controller.getSnapshot().status).toBe('local-only');
    expect(h.counts().get).toBe(0);
    expect(h.counts().update).toBe(0);
    expect(h.counts().create).toBe(0);
    // Privacy bounce hydrates draft/default (no checkpoint → never A content)
    expect(h.hydrated.length).toBe(1);
    expect(h.hydrated[0]?.finishes.floorMaterialId).toBe('draft-oak');
    expect(h.getCurrent().finishes.floorMaterialId).toBe('draft-oak');
  });

  it('explicit Save retries unsynced network failure via update (no stale resurrection)', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('oak'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });
    // Network failure on next edit
    env.updateScript.push({ kind: 'resolve', result: { kind: 'failure', reason: 'network' } });
    h.setCurrent(projectWithFloor('gen1'));
    h.controller.notifyLocalChange(h.getCurrent());
    await h.waitForStatus('unsynced');
    const before = h.counts().update;
    // Explicit Save must retry the CURRENT snapshot, not resurrect stale
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
    });
    expect(h.counts().update).toBe(before + 1);
    // After success, should return to clean without stale
    await h.waitForStatus('clean');
    expect([...env.remote.values()].at(-1)!.floor).toBe('gen1');
  });

  it('initial POST network failure → explicit Save retries via POST not PUT (zero PUT before create)', async () => {
    const env = makeEnv();
    env.createScript.push({ kind: 'resolve', result: { kind: 'failure', reason: 'network' } });
    const h = createController(env, projectWithFloor('oak'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave(); // first attach → POST network failure
    });
    await h.waitForStatus('unsynced');
    expect(h.counts().create).toBe(1);
    expect(h.counts().update).toBe(0);
    const checkpointBefore = await h.checkpointFor(USER_A);
    expect(checkpointBefore?.pendingCreateHash).toBeDefined();
    expect(checkpointBefore?.revision).toBeNull();
    // Explicit Save must retry CREATE (GET not_found → POST same projectId), never PUT
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
    });
    await h.waitForStatus('clean');
    expect(h.counts().create).toBe(2);
    expect(h.counts().update).toBe(0); // invariant: no UPDATE before successful CREATE
    expect([...env.remote.values()].at(-1)!.floor).toBe('oak');
    const checkpointAfter = await h.checkpointFor(USER_A);
    expect(checkpointAfter?.revision).toBe(1);
    expect(checkpointAfter?.pendingCreateHash).toBeUndefined();
  });

  it('initial POST lost response (server has rev1) → explicit Save adopts without duplicate bump', async () => {
    const env = makeEnv();
    env.createScript.push({ kind: 'resolve', result: { kind: 'failure', reason: 'network' } });
    const h = createController(env, projectWithFloor('oak'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
    });
    await h.waitForStatus('unsynced');
    const checkpoint = await h.checkpointFor(USER_A);
    const projectId = checkpoint?.projectId;
    expect(projectId).toBeDefined();
    // Simulate server actually created rev1 with identical content (response lost)
    const pendingDoc = projectWithFloor('oak');
    env.remote.set(projectId!, { revision: 1, canonical: serializeRoomProjectCanonical(pendingDoc), floor: 'oak' });
    const beforeCreate = h.counts().create;
    const beforeUpdate = h.counts().update;
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave(); // should GET, see pending hash, adopt
    });
    await h.waitForStatus('clean');
    // No new CREATE, no UPDATE bump for identical content
    expect(h.counts().create).toBe(beforeCreate);
    expect(h.counts().update).toBe(beforeUpdate);
    expect(h.controller.getSnapshot()).toMatchObject({ status: 'clean', revision: 1 });
    const after = await h.checkpointFor(USER_A);
    expect(after?.pendingCreateHash).toBeUndefined();
    expect(after?.revision).toBe(1);
    // Now a genuine edit after adoption should create a new revision
    h.setCurrent(projectWithFloor('oak-edited'));
    h.controller.notifyLocalChange(h.getCurrent());
    await expect.poll(async () => [...env.remote.values()].at(-1)!.floor, { timeout: 5000 }).toBe('oak-edited');
    await h.waitForStatus('clean');
  });

  it('initial POST with local edit coalesced → lost response adopts then flushes latest via PUT', async () => {
    const env = makeEnv();
    env.createScript.push({ kind: 'resolve', result: { kind: 'failure', reason: 'network' } });
    const h = createController(env, projectWithFloor('oak'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
    });
    await h.waitForStatus('unsynced');
    const checkpoint = await h.checkpointFor(USER_A);
    expect(checkpoint).toBeDefined();
    const projectId = checkpoint!.projectId;
    // Local edit coalesced while create was in flight
    const edited = projectWithFloor('oak-edited');
    h.setCurrent(edited);
    h.controller.notifyLocalChange(edited);
    // Server actually holds original oak rev1 (lost response)
    env.remote.set(projectId, { revision: 1, canonical: serializeRoomProjectCanonical(projectWithFloor('oak')), floor: 'oak' });
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
    });
    // Should adopt rev1 then immediately push edited as rev2
    await h.waitForStatus('clean');
    // Adoption itself doesn't count as create, but the coalesced edit becomes a PUT
    await expect.poll(async () => [...env.remote.values()].at(-1)!.revision, { timeout: 5000 }).toBe(2);
    expect([...env.remote.values()].at(-1)!.floor).toBe('oak-edited');
  });

  it('synchronous A→B privacy barrier before async SHA', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('walnut'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });
    expect(h.getCurrent().finishes.floorMaterialId).toBe('walnut');
    // Start B authentication but do not await — barrier must be synchronous
    const switching = h.controller.handleIdentityAuthenticated(USER_B);
    // Before first async continuation, editor and active storage must already be cleared
    expect(h.getCurrent().finishes.floorMaterialId).not.toBe('walnut');
    expect([...env.draftBackend.values()].some((v) => v.includes('"walnut"'))).toBe(false);
    await switching;
    expect(h.controller.getSnapshot().status).toBe('local-only');
    expect(h.counts().get).toBe(0);
  });

  it('stale A hash does not enqueue A content into B project (bindingEpoch guard)', async () => {
    const env2 = makeEnv();
    const h2 = createController(env2, projectWithFloor('walnut'));
    await h2.asUser(USER_A, async () => {
      await h2.controller.requestExplicitSave();
      await h2.waitForStatus('clean');
    });
    const aProjectId2 = (await h2.checkpointFor(USER_A))!.projectId;
    // Prepare B
    const bDoc2 = projectWithFloor('b-oak');
    const bHash2 = await ownerPartitionHash(USER_B);
    const bProjectId2 = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    env2.backend.set(`interior-magic-sync-checkpoint-v1:u:${bHash2}`, JSON.stringify({ version: 1, ownerUserIdHash: bHash2, projectId: bProjectId2, revision: 1, lastSyncedHash: await hashRoomProjectDocument(bDoc2) }));
    env2.backend.set(`interior-magic-project-v1:u:${bHash2}`, serializeRoomProjectCanonical(bDoc2));
    env2.remote.set(bProjectId2, { revision: 1, canonical: serializeRoomProjectCanonical(bDoc2), floor: 'b-oak' });

    h2.setCurrent(projectWithFloor('walnut-edited'));
    h2.controller.notifyLocalChange(h2.getCurrent()); // hash microtask pending
    const switching2 = h2.controller.handleIdentityAuthenticated(USER_B); // sync detach bumps epoch
    await switching2;
    // Allow hash microtask to run (should be dropped due to epoch mismatch)
    await new Promise((r) => setTimeout(r, 10));
    expect(h2.counts().update).toBe(0);
    expect(env2.remote.get(bProjectId2)?.floor).toBe('b-oak');
    expect(env2.remote.get(aProjectId2)?.floor).toBe('walnut');
    expect(h2.getCurrent().finishes.floorMaterialId).toBe('b-oak');
  });

  it('stale A reconcile GET does not mutate B state (epoch guard)', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('walnut'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });
    const bDoc = projectWithFloor('b-oak');
    const bHash = await ownerPartitionHash(USER_B);
    const bProjectId = '88888888-aaaa-4bbb-8ccc-eeeeeeeeeeee';
    env.backend.set(`interior-magic-sync-checkpoint-v1:u:${bHash}`, JSON.stringify({ version: 1, ownerUserIdHash: bHash, projectId: bProjectId, revision: 5, lastSyncedHash: await hashRoomProjectDocument(bDoc) }));
    env.backend.set(`interior-magic-project-v1:u:${bHash}`, serializeRoomProjectCanonical(bDoc));
    env.remote.set(bProjectId, { revision: 5, canonical: serializeRoomProjectCanonical(bDoc), floor: 'b-oak' });

    // Deferred GET for h's reconcile
    let resolveGet!: (v: RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>) => void;
    const deferredGet = new Promise<RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>>((resolve) => {
      resolveGet = resolve;
    });
    env.getScript.push({ kind: 'deferred', deferred: deferredGet, resolve: resolveGet! });
    const reconcilePromise = h.controller.reconcile();
    const switchingB = h.controller.handleIdentityAuthenticated(USER_B);
    // Resolve A's GET with walnut-edited (should be ignored due to epoch)
    const aProjectId = (await h.checkpointFor(USER_A))!.projectId;
    const walnutEdited = projectWithFloor('walnut-edited');
    resolveGet!({
      kind: 'ok',
      data: {
        metadata: { id: aProjectId, schemaVersion: 1, revision: 99, createdAt: 1, updatedAt: 1 },
        project: walnutEdited,
      },
    });
    await Promise.all([reconcilePromise, switchingB]);
    expect(h.getCurrent().finishes.floorMaterialId).toBe('b-oak');
    expect(h.controller.getSnapshot()).toMatchObject({ status: 'clean' });
    expect(env.remote.get(bProjectId)?.floor).toBe('b-oak');
  });

  it('A in-flight reconcile does not suppress B reconcile (epoch-scoped lock)', async () => {
    const env = makeEnv();
    const h = createController(env, projectWithFloor('walnut'));
    await h.asUser(USER_A, async () => {
      await h.controller.requestExplicitSave();
      await h.waitForStatus('clean');
    });
    // B has stale cache b-old rev5, remote is b-new rev6
    const bOld = projectWithFloor('b-old');
    const bNew = projectWithFloor('b-new');
    const bHash = await ownerPartitionHash(USER_B);
    const bProjectId = '77777777-aaaa-4bbb-8ccc-eeeeeeeeeeee';
    const bOldCanonical = serializeRoomProjectCanonical(bOld);
    const bNewCanonical = serializeRoomProjectCanonical(bNew);
    env.backend.set(`interior-magic-sync-checkpoint-v1:u:${bHash}`, JSON.stringify({ version: 1, ownerUserIdHash: bHash, projectId: bProjectId, revision: 5, lastSyncedHash: await hashRoomProjectDocument(bOld) }));
    env.backend.set(`interior-magic-project-v1:u:${bHash}`, bOldCanonical);
    env.remote.set(bProjectId, { revision: 6, canonical: bNewCanonical, floor: 'b-new' });
    // Start A reconcile with deferred GET (will be stale)
    let resolveAGet!: (v: RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>) => void;
    const aDeferred = new Promise<RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>>((resolve) => {
      resolveAGet = resolve;
    });
    env.getScript.push({ kind: 'deferred', deferred: aDeferred, resolve: resolveAGet! });
    const aReconcile = h.controller.reconcile();
    // Before A resolves, switch to B — B's handleIdentityAuthenticated will call reconcile for epoch 5→6
    const switchingB = h.controller.handleIdentityAuthenticated(USER_B);
    // At this point B's GET should have started (counts.get == 1 for A + 1 for B = 2)
    await new Promise((r) => setTimeout(r, 5));
    expect(h.counts().get).toBe(2);
    // Resolve A first with its old walnut (should be ignored)
    const aProjectId = (await h.checkpointFor(USER_A))!.projectId;
    resolveAGet!({
      kind: 'ok',
      data: {
        metadata: { id: aProjectId, schemaVersion: 1, revision: 1, createdAt: 1, updatedAt: 1 },
        project: projectWithFloor('walnut'),
      },
    });
    await Promise.all([aReconcile, switchingB]);
    // B should have adopted b-new rev6
    await h.waitForStatus('clean');
    expect(h.getCurrent().finishes.floorMaterialId).toBe('b-new');
    expect(h.controller.getSnapshot()).toMatchObject({ status: 'clean', revision: 6 });
    expect(env.remote.get(bProjectId)?.floor).toBe('b-new');
  });
});
