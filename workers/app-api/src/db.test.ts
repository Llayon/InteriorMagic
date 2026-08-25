/* eslint-disable @typescript-eslint/no-this-alias */
import { describe, expect, it } from 'vitest';
import { getOrCreateUserId } from './db';

class MockD1 {
  users = new Map<string, { id: string; created_at: number }>();
  identities = new Map<string, { provider: string; provider_subject: string; user_id: string; created_at: number }>();

  prepare(sql: string) {
    const self = this;
    return {
      bind(...params: unknown[]) {
        return {
          sql,
          params,
          async first<T>(): Promise<T | null> {
            if (sql.includes('SELECT user_id FROM external_identities')) {
              const [provider, subject] = params as [string, string];
              const key = `${provider}:${subject}`;
              const row = self.identities.get(key);
              return (row ? ({ user_id: row.user_id } as unknown as T) : null);
            }
            return null;
          },
          async run() {
            // For direct run (not used in batch)
            if (sql.includes('INSERT INTO users')) {
              const [id, created_at] = params as [string, number];
              if (self.users.has(id)) throw new Error('UNIQUE constraint failed: users.id');
              self.users.set(id, { id, created_at });
              return { success: true } as unknown as D1Result;
            }
            if (sql.includes('INSERT INTO external_identities')) {
              const [provider, provider_subject, user_id, created_at] = params as [string, string, string, number];
              const key = `${provider}:${provider_subject}`;
              if (self.identities.has(key)) throw new Error('UNIQUE constraint failed: external_identities');
              // Check UNIQUE(user_id, provider)
              for (const v of self.identities.values()) {
                if (v.user_id === user_id && v.provider === provider) throw new Error('UNIQUE constraint failed: user_id provider');
              }
              // FK check
              if (!self.users.has(user_id)) throw new Error('FOREIGN KEY constraint failed');
              self.identities.set(key, { provider, provider_subject, user_id, created_at });
              return { success: true } as unknown as D1Result;
            }
            return { success: true } as unknown as D1Result;
          },
          async all() {
            return { results: [] } as unknown as D1Result;
          },
        } as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database['prepare'];
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    // Snapshot for atomicity
    const usersSnap = new Map(this.users);
    const identitiesSnap = new Map(this.identities);
    const results: D1Result[] = [];
    try {
      for (const stmt of statements) {
        const s = stmt as unknown as { sql: string; params: unknown[] };
        const sql = s.sql;
        const params = s.params;
        if (sql.includes('INSERT INTO users')) {
          const [id, created_at] = params as [string, number];
          if (this.users.has(id)) throw new Error('UNIQUE constraint failed: users.id');
          this.users.set(id, { id, created_at });
          results.push({ success: true } as unknown as D1Result);
        } else if (sql.includes('INSERT INTO external_identities')) {
          const [provider, provider_subject, user_id, created_at] = params as [string, string, string, number];
          const key = `${provider}:${provider_subject}`;
          if (this.identities.has(key)) throw new Error('UNIQUE constraint failed: external_identities');
          for (const v of this.identities.values()) {
            if (v.user_id === user_id && v.provider === provider) throw new Error('UNIQUE constraint failed: user_id provider');
          }
          if (!this.users.has(user_id)) throw new Error('FOREIGN KEY constraint failed');
          this.identities.set(key, { provider, provider_subject, user_id, created_at });
          results.push({ success: true } as unknown as D1Result);
        } else {
          results.push({ success: true } as unknown as D1Result);
        }
      }
      return results;
    } catch (e) {
      // Rollback
      this.users = usersSnap;
      this.identities = identitiesSnap;
      throw e;
    }
  }

  // Minimal D1Database interface compliance
  exec = async () => ({ count: 0, duration: 0 } as unknown as D1ExecResult);
  dump = async () => new ArrayBuffer(0);
}

describe('getOrCreateUserId', () => {
  it('first authentication creates User and ExternalIdentity', async () => {
    const db = new MockD1() as unknown as D1Database;
    const userId = await getOrCreateUserId(db, 'telegram', '123');
    expect(typeof userId).toBe('string');
    const m = db as unknown as MockD1;
    expect(m.users.size).toBe(1);
    expect(m.identities.size).toBe(1);
    expect(m.identities.get('telegram:123')?.user_id).toBe(userId);
  });

  it('repeated authentication returns same User', async () => {
    const db = new MockD1() as unknown as D1Database;
    const first = await getOrCreateUserId(db, 'telegram', '123');
    const second = await getOrCreateUserId(db, 'telegram', '123');
    expect(second).toBe(first);
    const m = db as unknown as MockD1;
    expect(m.users.size).toBe(1);
    expect(m.identities.size).toBe(1);
  });

  it('two Telegram subjects produce different Users', async () => {
    const db = new MockD1() as unknown as D1Database;
    const a = await getOrCreateUserId(db, 'telegram', '111');
    const b = await getOrCreateUserId(db, 'telegram', '222');
    expect(a).not.toBe(b);
    const m = db as unknown as MockD1;
    expect(m.users.size).toBe(2);
    expect(m.identities.size).toBe(2);
  });

  it('concurrent first authentication creates no orphan User', async () => {
    const db = new MockD1() as unknown as D1Database;
    const subject = '999';
    const promises = Array.from({ length: 10 }, () => getOrCreateUserId(db, 'telegram', subject));
    const ids = await Promise.all(promises);
    const unique = new Set(ids);
    expect(unique.size).toBe(1);
    const m = db as unknown as MockD1;
    expect(m.users.size).toBe(1);
    expect(m.identities.size).toBe(1);
    // No orphan: users count equals identities count
    expect(m.users.size).toBe(m.identities.size);
  });

  it('provider subject remains string', async () => {
    const db = new MockD1() as unknown as D1Database;
    const id = await getOrCreateUserId(db, 'telegram', '007');
    expect(typeof id).toBe('string');
    const m = db as unknown as MockD1;
    expect(m.identities.get('telegram:007')?.provider_subject).toBe('007');
  });
});
