/* eslint-disable @typescript-eslint/no-this-alias */
import { describe, expect, it } from 'vitest';
import { createProject, getProject, updateProjectCas, type ProjectMetadata, type ProjectRow } from './projects';

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

/** D1 mock with meta.changes support, sequential transactional batch and
 *  snapshot rollback — the minimum needed to characterize CAS classification. */
class MockD1 {
  users = new Map<string, { id: string; created_at: number }>();
  projects = new Map<string, ProjectRow>();

  seedUser(id: string) {
    this.users.set(id, { id, created_at: 0 });
  }

  doInsert(params: [string, string, number, string, number, number]) {
    const [id, user_id, schema_version, project_json, created_at, updated_at] = params;
    if (this.projects.has(id)) throw new Error('UNIQUE constraint failed: projects.id');
    if (!this.users.has(user_id)) throw new Error('FOREIGN KEY constraint failed');
    this.projects.set(id, { id, user_id, schema_version, revision: 1, project_json, created_at, updated_at });
  }

  prepare(sql: string) {
    const self = this;
    const makeResult = (statement: { sql: string; params: unknown[] }): D1Result => {
      if (statement.sql.startsWith('INSERT INTO projects')) {
        const [id] = statement.params as [string, string, number, string, number, number];
        if (statement.sql.includes('ON CONFLICT')) {
          if (self.projects.has(id)) return { success: true, meta: { changes: 0 } } as unknown as D1Result;
          self.doInsert(statement.params as [string, string, number, string, number, number]);
          return { success: true, meta: { changes: 1 } } as unknown as D1Result;
        }
        self.doInsert(statement.params as [string, string, number, string, number, number]);
        return { success: true, meta: { changes: 1 } } as unknown as D1Result;
      }
      return { success: true, meta: { changes: 0 } } as unknown as D1Result;
    };
    return {
      bind(...params: unknown[]) {
        const statement = { sql, params };
        return {
          ...statement,
          async first<T>(): Promise<T | null> {
            if (sql.includes('FROM projects WHERE id = ? AND user_id = ?')) {
              const [id, userId] = params as [string, string];
              const row = self.projects.get(id);
              return (row && row.user_id === userId ? ({ ...row } as unknown as T) : null);
            }
            return null;
          },
          async run() {
            return makeResult(statement as { sql: string; params: unknown[] });
          },
          async all(): Promise<D1Result> {
            return { success: true, results: [], meta: { changes: 0 } } as unknown as D1Result;
          },
        } as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database['prepare'];
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const snapshot = new Map(this.projects);
    const results: D1Result[] = [];
    try {
      for (const stmt of statements) {
        const s = stmt as unknown as { sql: string; params: unknown[] };
        if (s.sql.startsWith('UPDATE projects')) {
          const [project_json, schema_version, updated_at, id, user_id, expectedRevision] = s.params as [
            string,
            number,
            number,
            string,
            string,
            number,
          ];
          const row = this.projects.get(id);
          if (row && row.user_id === user_id && row.revision === expectedRevision) {
            this.projects.set(id, {
              ...row,
              project_json,
              schema_version,
              revision: row.revision + 1,
              updated_at,
            });
            results.push({ success: true, meta: { changes: 1 } } as unknown as D1Result);
          } else {
            results.push({ success: true, meta: { changes: 0 } } as unknown as D1Result);
          }
        } else if (s.sql.includes('FROM projects WHERE id = ? AND user_id = ?')) {
          const [id, userId] = s.params as [string, string];
          const row = this.projects.get(id);
          const visible = row && row.user_id === userId ? [{ ...row }] : [];
          results.push({ success: true, results: visible, meta: { changes: 0 } } as unknown as D1Result);
        } else if (s.sql.startsWith('INSERT INTO projects')) {
          const [id] = s.params as [string, string, number, string, number, number];
          if (s.sql.includes('ON CONFLICT')) {
            if (this.projects.has(id)) {
              results.push({ success: true, meta: { changes: 0 } } as unknown as D1Result);
            } else {
              this.doInsert(s.params as [string, string, number, string, number, number]);
              results.push({ success: true, meta: { changes: 1 } } as unknown as D1Result);
            }
          } else {
            this.doInsert(s.params as [string, string, number, string, number, number]);
            results.push({ success: true, meta: { changes: 1 } } as unknown as D1Result);
          }
        } else {
          results.push({ success: true, meta: { changes: 0 } } as unknown as D1Result);
        }
      }
      return results;
    } catch (e) {
      this.projects = snapshot;
      throw e;
    }
  }

  exec = async () => ({ count: 0, duration: 0 } as unknown as D1ExecResult);
  dump = async () => new ArrayBuffer(0);
}

const makeDb = () => {
  const db = new MockD1();
  db.seedUser(USER_A);
  db.seedUser(USER_B);
  return db as unknown as D1Database;
};

const rowsOf = (db: D1Database) => (db as unknown as MockD1).projects;

describe('createProject', () => {
  it('creates with initial revision 1 and server timestamps', async () => {
    const db = makeDb();
    const result = await createProject(db, USER_A, 'p1', 1, '{"k":1}', 1000);
    expect(result).toEqual({
      kind: 'created',
      metadata: { id: 'p1', schemaVersion: 1, revision: 1, createdAt: 1000, updatedAt: 1000 },
    });
    expect(rowsOf(db).get('p1')?.created_at).toBe(1000);
  });

  it('retry with same UUID/owner/content is idempotent and adds no second row', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"k":1}', 1000);
    const retry = await createProject(db, USER_A, 'p1', 1, '{"k":1}', 2000);
    expect(retry.kind).toBe('idempotent');
    expect((retry as { metadata: ProjectMetadata }).metadata.revision).toBe(1);
    expect(rowsOf(db).size).toBe(1);
    // created_at stays the original server timestamp
    expect(rowsOf(db).get('p1')?.created_at).toBe(1000);
  });

  it('same UUID different content is a controlled conflict', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"k":1}', 1000);
    const retry = await createProject(db, USER_A, 'p1', 1, '{"k":2}', 1000);
    expect(retry.kind).toBe('conflict');
    expect(rowsOf(db).get('p1')?.project_json).toBe('{"k":1}');
  });

  it('same UUID foreign owner is indistinguishable conflict without an ownership oracle', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"k":1}', 1000);
    const foreignCreate = await createProject(db, USER_B, 'p1', 1, '{"k":9}', 1000);
    expect(foreignCreate.kind).toBe('conflict');
    // Owner B cannot observe the foreign row either.
    expect(await getProject(db, USER_B, 'p1')).toBeNull();
    expect(rowsOf(db).get('p1')?.user_id).toBe(USER_A);
  });
});

describe('getProject', () => {
  it('owner read succeeds; foreign and missing are both not found', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"k":1}', 1000);
    expect((await getProject(db, USER_A, 'p1'))?.user_id).toBe(USER_A);
    expect(await getProject(db, USER_B, 'p1')).toBeNull();
    expect(await getProject(db, USER_A, 'missing')).toBeNull();
  });
});

describe('updateProjectCas', () => {
  it('success increments revision exactly by one and keeps created_at', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    const result = await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 2000);
    expect(result).toEqual({
      kind: 'updated',
      metadata: { id: 'p1', schemaVersion: 1, revision: 2, createdAt: 1000, updatedAt: 2000 },
    });
    const row = rowsOf(db).get('p1')!;
    expect(row.revision).toBe(2);
    expect(row.project_json).toBe('{"v":2}');
    expect(row.created_at).toBe(1000);
  });

  it('two updates with same expected revision: one succeeds, one is stale', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    const first = updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 2000);
    const second = updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":3}', 3000);
    const [r1, r2] = [await first, await second];
    const winner = [r1, r2].find((r) => r.kind === 'updated');
    const loser = [r1, r2].find((r) => r.kind !== 'updated') as { kind: string; currentRevision?: number };
    expect(winner?.kind).toBe('updated');
    expect(loser.kind).toBe('stale_revision');
    expect(loser.currentRevision).toBe(2);
  });

  it('zero-change update distinguishes owner-scoped absence from stale', async () => {
    const db = makeDb();
    const missing = await updateProjectCas(db, USER_A, 'ghost', 1, 1, '{}', 1000);
    expect(missing.kind).toBe('not_found');
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    const stale = await updateProjectCas(db, USER_A, 'p1', 7, 1, '{"v":2}', 2000);
    expect(stale).toEqual({ kind: 'stale_revision', currentRevision: 1 });
  });

  it('committed-update retry with identical content at expectedRevision+1 is already_applied', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 2000); // committed rev 2, response lost
    const retry = await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 3000);
    expect(retry.kind).toBe('already_applied');
    expect((retry as { metadata: ProjectMetadata }).metadata.revision).toBe(2);
  });

  it('narrow invariant: expected 3 vs server revision 5 with identical JSON is stale_revision', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 2000); // rev 2
    await updateProjectCas(db, USER_A, 'p1', 2, 1, '{"v":3}', 3000); // rev 3
    await updateProjectCas(db, USER_A, 'p1', 3, 1, '{"v":4}', 4000); // rev 4... then one more to reach 5
    await updateProjectCas(db, USER_A, 'p1', 4, 1, '{"v":5}', 5000); // rev 5
    const jump = await updateProjectCas(db, USER_A, 'p1', 3, 1, '{"v":5}', 6000);
    expect(jump).toEqual({ kind: 'stale_revision', currentRevision: 5 });
  });

  it('expectedRevision+1 but different content is stale_revision, not already_applied', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 2000); // rev 2
    const mismatch = await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":999}', 3000);
    expect(mismatch).toEqual({ kind: 'stale_revision', currentRevision: 2 });
  });

  it('foreign owner cannot update: classified as not_found without exposing existence', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    const foreign = await updateProjectCas(db, USER_B, 'p1', 1, 1, '{"v":2}', 2000);
    expect(foreign).toEqual({ kind: 'not_found' });
    expect(rowsOf(db).get('p1')?.revision).toBe(1);
  });

  it('schema_version mirrors submitted document version on update', async () => {
    const db = makeDb();
    await createProject(db, USER_A, 'p1', 1, '{"v":1}', 1000);
    const result = await updateProjectCas(db, USER_A, 'p1', 1, 1, '{"v":2}', 2000);
    expect(rowsOf(db).get('p1')?.schema_version).toBe(1);
    expect(result.kind).toBe('updated');
  });
});
