import { describe, expect, it } from 'vitest';
import {
  buildExpiredCookieHeader,
  buildSetCookieHeader,
  createSession,
  deleteSessionByTokenHash,
  generateSessionToken,
  getSessionByTokenHash,
  hashToken,
  parseSessionTtlEnv,
  sessionCookiePolicy,
} from './session';

class MockD1Sessions {
  users = new Map<string, { id: string; created_at: number }>();
  sessions = new Map<string, { id_hash: string; user_id: string; created_at: number; expires_at: number }>();
  prepare(sql: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      bind(...params: unknown[]) {
        return {
          sql,
          params,
          async first<T>(): Promise<T | null> {
            if (sql.includes('SELECT id_hash, user_id')) {
              const [hash] = params as [string];
              const row = self.sessions.get(hash);
              return (row ? ({ ...row } as unknown as T) : null);
            }
            return null;
          },
          async run() {
            if (sql.includes('INSERT INTO sessions')) {
              const [id_hash, user_id, created_at, expires_at] = params as [string, string, number, number];
              if (self.sessions.has(id_hash)) throw new Error('UNIQUE sessions');
              if (!self.users.has(user_id)) throw new Error('FK');
              self.sessions.set(id_hash, { id_hash, user_id, created_at, expires_at });
              return { success: true } as unknown as D1Result;
            }
            if (sql.includes('INSERT INTO users')) {
              const [id, created_at] = params as [string, number];
              self.users.set(id, { id, created_at });
              return { success: true } as unknown as D1Result;
            }
            if (sql.includes('DELETE FROM sessions WHERE id_hash')) {
              const [hash] = params as [string];
              self.sessions.delete(hash);
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
    const usersSnap = new Map(this.users);
    const sessionsSnap = new Map(this.sessions);
    try {
      const res: D1Result[] = [];
      for (const stmt of statements) {
        const s = stmt as unknown as { sql: string; params: unknown[] };
        if (s.sql.includes('INSERT INTO sessions')) {
          const [id_hash, user_id, created_at, expires_at] = s.params as [string, string, number, number];
          if (this.sessions.has(id_hash)) throw new Error('UNIQUE');
          if (!this.users.has(user_id)) throw new Error('FK');
          this.sessions.set(id_hash, { id_hash, user_id, created_at, expires_at });
          res.push({ success: true } as unknown as D1Result);
        } else if (s.sql.includes('INSERT INTO users')) {
          const [id, created_at] = s.params as [string, number];
          this.users.set(id, { id, created_at });
          res.push({ success: true } as unknown as D1Result);
        } else res.push({ success: true } as unknown as D1Result);
      }
      return res;
    } catch (e) {
      this.users = usersSnap;
      this.sessions = sessionsSnap;
      throw e;
    }
  }
  exec = async () => ({ count: 0, duration: 0 } as unknown as D1ExecResult);
  dump = async () => new ArrayBuffer(0);
}

describe('session token', () => {
  it('has sufficient entropy/length (43 base64url chars for 32B)', () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // Must not contain padding or +/
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });

  it('D1 stores only hash, raw never appears', async () => {
    const db = new MockD1Sessions() as unknown as D1Database;
    const mock = db as unknown as MockD1Sessions;
    mock.users.set('user-1', { id: 'user-1', created_at: Date.now() });
    const { rawToken, hash } = await createSession(db, 'user-1', Date.now(), 2592000);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(rawToken);
    const stored = mock.sessions.get(hash);
    expect(stored).toBeDefined();
    expect(stored?.id_hash).toBe(hash);
    // Raw token not in any stored field
    const allHashes = Array.from(mock.sessions.keys()).join('');
    expect(allHashes).not.toContain(rawToken);
    expect(JSON.stringify(stored)).not.toContain(rawToken);
  });

  it('same token resolves same session', async () => {
    const db = new MockD1Sessions() as unknown as D1Database;
    const mock = db as unknown as MockD1Sessions;
    mock.users.set('u1', { id: 'u1', created_at: Date.now() });
    const { rawToken } = await createSession(db, 'u1', Date.now(), 2592000);
    const hash = await hashToken(rawToken);
    const first = await getSessionByTokenHash(db, hash, Date.now());
    const second = await getSessionByTokenHash(db, hash, Date.now());
    expect(first?.user_id).toBe('u1');
    expect(second?.user_id).toBe('u1');
  });

  it('random token fails', async () => {
    const db = new MockD1Sessions() as unknown as D1Database;
    const randomHash = await hashToken(generateSessionToken());
    const res = await getSessionByTokenHash(db, randomHash, Date.now());
    expect(res).toBeNull();
  });

  it('expired token fails and is deleted lazily', async () => {
    const db = new MockD1Sessions() as unknown as D1Database;
    const mock = db as unknown as MockD1Sessions;
    mock.users.set('u1', { id: 'u1', created_at: 1000 });
    const { hash } = await createSession(db, 'u1', 1000, 1); // 1s TTL
    // Fast-forward beyond expiry
    const res = await getSessionByTokenHash(db, hash, 5000);
    expect(res).toBeNull();
    expect(mock.sessions.has(hash)).toBe(false); // lazy delete
  });

  it('deleted token fails', async () => {
    const db = new MockD1Sessions() as unknown as D1Database;
    const mock = db as unknown as MockD1Sessions;
    mock.users.set('u1', { id: 'u1', created_at: Date.now() });
    const { hash } = await createSession(db, 'u1', Date.now(), 2592000);
    await deleteSessionByTokenHash(db, hash);
    const res = await getSessionByTokenHash(db, hash, Date.now());
    expect(res).toBeNull();
  });
});

describe('session cookie policy', () => {
  it('production HTTPS uses __Host-im_session + Secure', () => {
    const policy = sessionCookiePolicy({ ALLOWED_ORIGIN: 'https://interiormagic.example' });
    expect(policy.name).toBe('__Host-im_session');
    expect(policy.secure).toBe(true);
    expect(policy.sameSite).toBe('Lax');
    expect(policy.path).toBe('/');
    const setCookie = buildSetCookieHeader(policy, 'tok', 2592000);
    expect(setCookie).toContain('__Host-im_session=tok');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain');
  });

  it('local HTTP uses im_session without Secure', () => {
    const policy = sessionCookiePolicy({ ALLOWED_ORIGIN: 'http://localhost:4173' });
    expect(policy.name).toBe('im_session');
    expect(policy.secure).toBe(false);
    const setCookie = buildSetCookieHeader(policy, 'tok', 2592000);
    expect(setCookie).toContain('im_session=tok');
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).not.toContain('Domain');
    expect(setCookie).toContain('HttpOnly');
  });

  it('production never accepts im_session (policy is exclusive)', () => {
    const prodPolicy = sessionCookiePolicy({ ALLOWED_ORIGIN: 'https://api.interior.example' });
    const localPolicy = sessionCookiePolicy({ ALLOWED_ORIGIN: 'http://localhost:4173' });
    expect(prodPolicy.name).not.toBe(localPolicy.name);
  });

  it('logout expires cookie with Max-Age 0', () => {
    const policy = sessionCookiePolicy({ ALLOWED_ORIGIN: 'https://example.invalid' });
    const expired = buildExpiredCookieHeader(policy);
    expect(expired).toContain('Max-Age=0');
    expect(expired).toContain('Expires=Thu, 01 Jan 1970');
    expect(expired).toContain(policy.name);
  });
});

describe('parseSessionTtlEnv', () => {
  it('parses valid 2592000', () => {
    expect(parseSessionTtlEnv('2592000')).toBe(2592000);
  });
  it('rejects invalid', () => {
    expect(parseSessionTtlEnv('')).toBeNull();
    expect(parseSessionTtlEnv('0')).toBeNull();
    expect(parseSessionTtlEnv('-1')).toBeNull();
    expect(parseSessionTtlEnv('99999999')).toBeNull(); // > MAX
    expect(parseSessionTtlEnv('abc')).toBeNull();
  });
});
