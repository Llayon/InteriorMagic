import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject, type RoomProject } from '@/editor/model/types';
import { hashRoomProjectDocument } from '@/editor/serialization/projectDocument';
import type { RemoteProjectMetadata, RemoteResult } from './remoteProjectRepository';
import { ProjectSyncQueue } from './projectSyncQueue';

const project = (marker: number): RoomProject => {
  const base = createDefaultProject();
  return { ...base, finishes: { floorMaterialId: `m-${marker}`, wallMaterialId: 'linen' } };
};

type Entry = { bindingEpoch: number; projectId: string; generation: number; project: RoomProject; hash: string };
const entry = async (generation: number, epoch = 0, projectId = 'p'): Promise<Entry> => ({
  bindingEpoch: epoch,
  projectId,
  generation,
  project: project(generation),
  hash: await hashRoomProjectDocument(project(generation)),
});

interface Harness {
  queue: ProjectSyncQueue;
  updates: Array<{ entryHash: string; expectedRevision: number }>;
  creates: string[];
  adoptions: Array<{ revision: number; syncedHash: string }>;
  conflicts: string[];
  unsynced: string[];
  resolveInFlight: (result: RemoteResult<RemoteProjectMetadata>) => void;
}

const makeQueue = (): Harness => {
  const h: Harness = {
    queue: null as unknown as ProjectSyncQueue,
    updates: [], creates: [], adoptions: [], conflicts: [], unsynced: [],
    resolveInFlight: () => undefined,
  };
  let inFlightResolver: ((r: RemoteResult<RemoteProjectMetadata>) => void) | null = null;
  const deferred = (): Promise<RemoteResult<RemoteProjectMetadata>> => new Promise((resolve) => {
    inFlightResolver = resolve;
    h.resolveInFlight = (r) => inFlightResolver?.(r);
  });
  const immediateOk = (): Promise<RemoteResult<RemoteProjectMetadata>> => Promise.resolve({
    kind: 'ok', data: { id: 'p', schemaVersion: 1, revision: h.adoptions.at(-1)?.revision ?? 2, createdAt: 1, updatedAt: 1 },
  });

  const callbacks = {
    sendCreate: vi.fn(async (e: Entry): Promise<RemoteResult<RemoteProjectMetadata>> => {
      h.creates.push(e.hash);
      return deferred();
    }),
    sendUpdate: vi.fn(async (e: Entry, expectedRevision: number): Promise<RemoteResult<RemoteProjectMetadata>> => {
      h.updates.push({ entryHash: e.hash, expectedRevision });
      return inFlightResolver === null ? deferred() : immediateOk();
    }),
    onAdopted: (a: { revision: number; syncedHash: string }) => h.adoptions.push(a),
    onUnsynced: (reason: 'network' | 'server' | 'unauthenticated') => h.unsynced.push(reason),
    onConflict: (reason: string) => h.conflicts.push(reason),
    getExpectedRevision: () => h.adoptions.at(-1)?.revision ?? 1,
  };
  h.queue = new ProjectSyncQueue(callbacks);
  return h;
};

describe('single-flight coalescing', () => {
  it('ten rapid mutations collapse into first PUT plus one latest snapshot', async () => {
    const h = makeQueue();
    h.queue.enqueue(await entry(1), 'update');
    expect(h.updates).toHaveLength(1);
    for (let gen = 2; gen <= 10; gen += 1) h.queue.enqueue(await entry(gen), 'update');
    h.resolveInFlight({
      kind: 'ok', data: { id: 'p', schemaVersion: 1, revision: 2, createdAt: 1, updatedAt: 1 },
    });
    await vi.waitFor(() => expect(h.updates).toHaveLength(2));
    await vi.waitFor(() => expect(h.adoptions).toHaveLength(2));
    const lastSent = h.updates[1]!;
    expect(lastSent.expectedRevision).toBe(2); // adopted revision from the first response
    expect(lastSent.entryHash).toBe(await hashRoomProjectDocument(project(10))); // latest-wins
  });

  it('freezes automatic sends after a stale-revision conflict', async () => {
    const h = makeQueue();
    h.queue.enqueue(await entry(1), 'update');
    h.resolveInFlight({ kind: 'failure', reason: 'conflict_stale_revision' });
    await vi.waitFor(() => expect(h.conflicts).toEqual(['stale_revision']));
    h.queue.enqueue(await entry(2), 'update');
    expect(h.updates).toHaveLength(1); // frozen
    h.queue.unfreeze();
    h.queue.enqueue(await entry(3), 'update');
    expect(h.updates).toHaveLength(2);
  });

  it('maps not_found to remote_missing and create id-conflict to its own reason', async () => {
    const h = makeQueue();
    h.queue.enqueue(await entry(1), 'create');
    h.resolveInFlight({ kind: 'failure', reason: 'not_found' });
    await vi.waitFor(() => expect(h.conflicts).toEqual(['remote_missing']));

    const h2 = makeQueue();
    h2.queue.enqueue(await entry(1), 'create');
    h2.resolveInFlight({ kind: 'failure', reason: 'conflict_id' });
    await vi.waitFor(() => expect(h2.conflicts).toEqual(['create_conflict']));
  });

  it('network and unauthenticated map to unsynced without freezing', async () => {
    const h = makeQueue();
    h.queue.enqueue(await entry(1), 'update');
    h.resolveInFlight({ kind: 'failure', reason: 'network' });
    await vi.waitFor(() => expect(h.unsynced).toEqual(['network']));
    expect(h.queue.isFrozen()).toBe(false);

    const h2 = makeQueue();
    h2.queue.enqueue(await entry(1), 'update');
    h2.resolveInFlight({ kind: 'failure', reason: 'unauthenticated' });
    await vi.waitFor(() => expect(h2.unsynced).toEqual(['unauthenticated']));
  });

  it('invalidate drops pending work', async () => {
    const h = makeQueue();
    h.queue.enqueue(await entry(1), 'update');
    h.queue.enqueue(await entry(2), 'update'); // pending
    h.queue.invalidate();
    h.resolveInFlight({ kind: 'ok', data: { id: 'p', schemaVersion: 1, revision: 2, createdAt: 1, updatedAt: 1 } });
    await new Promise((r) => setTimeout(r, 5));
    expect(h.updates).toHaveLength(1); // pending never sent
    expect(h.adoptions).toHaveLength(0);
  });

  it('success adopts the returned revision with the SENT snapshot hash', async () => {
    const h = makeQueue();
    const first = await entry(1);
    h.queue.enqueue(first, 'update');
    h.resolveInFlight({ kind: 'ok', data: { id: 'p', schemaVersion: 1, revision: 5, createdAt: 1, updatedAt: 1 } });
    await vi.waitFor(() => expect(h.adoptions).toEqual([{ revision: 5, syncedHash: first.hash }]));
  });

  it('high-water rejects stale generations and history never contains them', async () => {
    const h = makeQueue();
    h.queue.enqueue(await entry(5), 'update');
    expect(h.updates).toHaveLength(1);
    const hash5 = await hashRoomProjectDocument(project(5));
    expect(h.updates[0]!.entryHash).toBe(hash5);
    // Stale gen 3 must be dropped by highestGenerationSeen
    h.queue.enqueue(await entry(3), 'update');
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]!.entryHash).not.toBe(await hashRoomProjectDocument(project(3)));
    h.resolveInFlight({ kind: 'ok', data: { id: 'p', schemaVersion: 1, revision: 2, createdAt: 1, updatedAt: 1 } });
    await vi.waitFor(() => expect(h.adoptions).toHaveLength(1));
    // Invalidate resets high-water
    h.queue.invalidate();
    h.queue.enqueue(await entry(3), 'update');
    expect(h.updates).toHaveLength(2);
  });
});
