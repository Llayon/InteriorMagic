import { describe, expect, it } from 'vitest';
import {
  DRAFT_PROJECT_KEY,
  ProjectSyncCheckpointStore,
  ownerPartitionHash,
  partitionKeysFor,
  parseCheckpoint,
} from './projectSyncCheckpoint';

const memoryBackend = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('owner partition', () => {
  it('derives a full-length SHA-256 hex hash without truncation', async () => {
    const hash = await ownerPartitionHash('user-1');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await ownerPartitionHash('user-2')).not.toBe(hash);
  });

  it('keeps the legacy draft key and namespaces the attached partition', async () => {
    const hash = await ownerPartitionHash('user-1');
    const keys = partitionKeysFor(hash);
    expect(DRAFT_PROJECT_KEY).toBe('interior-magic-project-v1');
    expect(keys.projectKey).toBe(`interior-magic-project-v1:u:${hash}`);
    expect(keys.checkpointKey).toBe(`interior-magic-sync-checkpoint-v1:u:${hash}`);
  });
});

describe('checkpoint store', () => {
  it('round-trips a checkpoint through the partitioned key', async () => {
    const backend = memoryBackend();
    const store = new ProjectSyncCheckpointStore(backend);
    const hash = await ownerPartitionHash('user-1');
    store.write({ version: 1, ownerUserIdHash: hash, projectId: 'p1', revision: 3, lastSyncedHash: 'abc' });
    expect(store.read(hash)).toMatchObject({ projectId: 'p1', revision: 3 });
    expect(backend.map.has(partitionKeysFor(hash).checkpointKey)).toBe(true);
    store.clear(hash);
    expect(store.read(hash)).toBeNull();
  });

  it('fail-safes corrupt or foreign-version payloads to null', () => {
    const backend = memoryBackend();
    backend.map.set('k', '{"version":2,"projectId":"x"}');
    const store = new ProjectSyncCheckpointStore(backend);
    expect(store.read('k')).toBeNull();
  });
});

describe('parseCheckpoint', () => {
  it('rejects invalid revisions and wrong types', () => {
    expect(parseCheckpoint(null)).toBeNull();
    expect(parseCheckpoint({ version: 1 })).toBeNull();
    expect(parseCheckpoint({ version: 1, ownerUserIdHash: 'h', projectId: 'p', revision: 0, lastSyncedHash: null })).toBeNull();
    expect(parseCheckpoint({ version: 1, ownerUserIdHash: 'h', projectId: 'p', revision: 'x', lastSyncedHash: null })).toBeNull();
  });
});
