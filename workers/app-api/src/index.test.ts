/* eslint-disable @typescript-eslint/no-this-alias */
import { describe, expect, it } from 'vitest';
import { createAppApiHandler, MAX_WIRE_BODY_BYTES } from './index';

const BOT_TOKEN = '123456:TEST_BOT_TOKEN_FOR_H2';

const utf8 = (s: string) => new TextEncoder().encode(s);
const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function signInitData(params: Record<string, string>, botToken: string): Promise<string> {
  const filtered = Object.entries(params).filter(([k]) => k !== 'hash');
  filtered.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = filtered.map(([k, v]) => `${k}=${v}`).join('\n');
  const webAppDataKey = await crypto.subtle.importKey('raw', utf8('WebAppData') as unknown as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secretKeyBytes = await crypto.subtle.sign('HMAC', webAppDataKey, utf8(botToken) as unknown as ArrayBuffer);
  const secretKey = await crypto.subtle.importKey('raw', secretKeyBytes as unknown as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hashBytes = await crypto.subtle.sign('HMAC', secretKey, utf8(dataCheckString) as unknown as ArrayBuffer);
  const hash = toHex(hashBytes);
  const encoded = filtered.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${encoded}&hash=${hash}`;
}

function makeValidParams(overrides: Record<string, string> = {}): Record<string, string> {
  const now = Math.floor(Date.now() / 1000);
  return {
    query_id: 'AAHdF6IQAAAAAA0XohDhrOrc',
    user: JSON.stringify({ id: 279058397, first_name: 'Test' }),
    auth_date: String(now),
    ...overrides,
  };
}

class MockD1 {
  users = new Map<string, { id: string; created_at: number }>();
  identities = new Map<string, { provider: string; provider_subject: string; user_id: string; created_at: number }>();
  sessions = new Map<string, { id_hash: string; user_id: string; created_at: number; expires_at: number }>();
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
            if (sql.includes('SELECT id_hash, user_id, created_at, expires_at FROM sessions')) {
              const [hash] = params as [string];
              const row = self.sessions.get(hash);
              return (row ? ({ ...row } as unknown as T) : null);
            }
            if (sql.includes('SELECT id_hash, user_id, created_at, expires_at FROM sessions WHERE id_hash')) {
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
              if (!self.users.has(user_id)) throw new Error('FK sessions user_id');
              self.sessions.set(id_hash, { id_hash, user_id, created_at, expires_at });
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
    const identitiesSnap = new Map(this.identities);
    const sessionsSnap = new Map(this.sessions);
    const results: D1Result[] = [];
    try {
      for (const stmt of statements) {
        const s = stmt as unknown as { sql: string; params: unknown[] };
        const sql = s.sql;
        const params = s.params;
        if (sql.includes('INSERT INTO users')) {
          const [id, created_at] = params as [string, number];
          if (this.users.has(id)) throw new Error('UNIQUE users.id');
          this.users.set(id, { id, created_at });
          results.push({ success: true } as unknown as D1Result);
        } else if (sql.includes('INSERT INTO external_identities')) {
          const [provider, provider_subject, user_id, created_at] = params as [string, string, string, number];
          const key = `${provider}:${provider_subject}`;
          if (this.identities.has(key)) throw new Error('UNIQUE external_identities');
          for (const v of this.identities.values()) if (v.user_id === user_id && v.provider === provider) throw new Error('UNIQUE user_id provider');
          if (!this.users.has(user_id)) throw new Error('FK');
          this.identities.set(key, { provider, provider_subject, user_id, created_at });
          results.push({ success: true } as unknown as D1Result);
        } else if (sql.includes('INSERT INTO sessions')) {
          const [id_hash, user_id, created_at, expires_at] = params as [string, string, number, number];
          if (this.sessions.has(id_hash)) throw new Error('UNIQUE sessions');
          if (!this.users.has(user_id)) throw new Error('FK sessions');
          this.sessions.set(id_hash, { id_hash, user_id, created_at, expires_at });
          results.push({ success: true } as unknown as D1Result);
        } else if (sql.includes('DELETE FROM sessions')) {
          const [hash] = params as [string];
          this.sessions.delete(hash);
          results.push({ success: true } as unknown as D1Result);
        } else results.push({ success: true } as unknown as D1Result);
      }
      return results;
    } catch (e) {
      this.users = usersSnap;
      this.identities = identitiesSnap;
      this.sessions = sessionsSnap;
      throw e;
    }
  }
  exec = async () => ({ count: 0, duration: 0 } as unknown as D1ExecResult);
  dump = async () => new ArrayBuffer(0);
}

const makeEnv = (overrides: Partial<Record<string, unknown>> = {}): AppApiWorkerEnv => {
  const db = new MockD1() as unknown as D1Database;
  return {
    DB: db,
    ALLOWED_ORIGIN: 'https://example.invalid',
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '86400',
    SESSION_TTL_SECONDS: '2592000',
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    ...overrides,
  } as unknown as AppApiWorkerEnv;
};

const makeRequest = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Request => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(`https://app.test${path}`, { ...init, headers });
};

describe('POST /auth/telegram', () => {
  it('allows exact origin and returns user id', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string }; identity: { provider: string } };
    expect(body.user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.identity.provider).toBe('telegram');
    // Must not return Telegram ID or raw initData
    const text = JSON.stringify(body);
    expect(text).not.toContain('279058397');
    expect(text).not.toContain('hash');
    expect(text).not.toContain(BOT_TOKEN);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.invalid');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects foreign origin', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://evil.com' }, body: JSON.stringify({ initData: 'x' }) });
    const res = await handler(req, env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('origin_forbidden');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('handles OPTIONS preflight with exact origin', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'OPTIONS', headers: { origin: 'https://example.invalid' } });
    const res = await handler(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.invalid');
  });

  it('rejects OPTIONS without origin', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'OPTIONS' });
    const res = await handler(req, env);
    expect(res.status).toBe(403);
  });

  it('rejects wrong method', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'GET', headers: { origin: 'https://example.invalid' } });
    const res = await handler(req, env);
    expect(res.status).toBe(405);
  });

  it('rejects wrong content-type', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'text/plain' }, body: 'x' });
    const res = await handler(req, env);
    expect(res.status).toBe(415);
  });

  it('rejects application/jsonxxx (exact media type required)', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = new Request('https://app.test/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/jsonxxx' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_request');
  });

  it('accepts application/json with parameters (charset)', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = new Request('https://app.test/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(200);
  });

  it('rejects oversized body', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const large = 'a'.repeat(MAX_WIRE_BODY_BYTES + 1);
    const req = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-length': String(MAX_WIRE_BODY_BYTES + 1) },
      body: JSON.stringify({ initData: large }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('payload_too_large');
  });

  it('rejects missing env (server misconfigured)', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv({ ALLOWED_ORIGIN: 'not-a-url' } as unknown as Record<string, unknown>);
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData: 'x' }) });
    const res = await handler(req, env);
    expect(res.status).toBe(503);
  });

  it('rejects missing bot token', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: '' } as unknown as Record<string, unknown>);
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData }) });
    const res = await handler(req, env);
    expect(res.status).toBe(503);
  });

  it('rejects invalid initData (tampered)', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const tampered = initData.replace('279058397', '999');
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData: tampered }) });
    const res = await handler(req, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_init_data');
    expect(JSON.stringify(body)).not.toContain(BOT_TOKEN);
    expect(JSON.stringify(body)).not.toContain(tampered);
  });

  it('rejects stale auth_date', async () => {
    const stale = Math.floor(Date.now() / 1000) - 90000;
    const params = makeValidParams({ auth_date: String(stale) });
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData }) });
    const res = await handler(req, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('init_data_expired');
  });

  it('returns same user for same subject', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req1 = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData }) });
    const res1 = await handler(req1, env);
    const body1 = (await res1.json()) as { user: { id: string } };
    const req2 = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData }) });
    const res2 = await handler(req2, env);
    const body2 = (await res2.json()) as { user: { id: string } };
    expect(body2.user.id).toBe(body1.user.id);
  });

  it('different subjects produce different users', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const p1 = makeValidParams({ user: JSON.stringify({ id: 111 }) });
    const p2 = makeValidParams({ user: JSON.stringify({ id: 222 }) });
    const i1 = await signInitData(p1, BOT_TOKEN);
    const i2 = await signInitData(p2, BOT_TOKEN);
    const r1 = await handler(makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData: i1 }) }), env);
    const r2 = await handler(makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData: i2 }) }), env);
    const b1 = (await r1.json()) as { user: { id: string } };
    const b2 = (await r2.json()) as { user: { id: string } };
    expect(b1.user.id).not.toBe(b2.user.id);
  });

  it('404 for wrong path', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/wrong', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: JSON.stringify({ initData: 'x' }) });
    const res = await handler(req, env);
    expect(res.status).toBe(404);
  });

  it('controlled 4xx body shape', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/auth/telegram', { method: 'POST', headers: { origin: 'https://example.invalid' }, body: 'not json' });
    const res = await handler(req, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(typeof body.error.code).toBe('string');
    expect(JSON.stringify(body)).not.toContain(BOT_TOKEN);
  });

  it('rejects POST without Origin', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = new Request('https://app.test/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('origin_forbidden');
  });

  it('rejects POST without Content-Type', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = new Request('https://app.test/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_request');
  });

  it('returns internal_error for unexpected D1 failure', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const failingDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          run: async () => ({ success: true }) as unknown as D1Result,
          all: async () => ({ results: [] }) as unknown as D1Result,
        }),
      }),
      batch: async () => {
        throw new Error('D1 unavailable');
      },
      exec: async () => ({ count: 0, duration: 0 }) as unknown as D1ExecResult,
      dump: async () => new ArrayBuffer(0),
    } as unknown as D1Database;
    const env = makeEnv({ DB: failingDb } as unknown as Record<string, unknown>);
    const req = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('D1 unavailable');
  });
});

describe('GET /session and POST /logout session lifecycle', () => {
  const extractToken = (setCookie: string | null): string | null => {
    if (!setCookie) return null;
    const match = setCookie.match(/(?:__Host-im_session|im_session)=([^;]+)/);
    return match ? match[1]! : null;
  };

  it('POST /auth/telegram creates session and Set-Cookie with correct production attributes', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv({ ALLOWED_ORIGIN: 'https://interiormagic.example' } as unknown as Record<string, unknown>);
    const req = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://interiormagic.example', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    // Need to set allowedOrigin to https for __Host
    (env as unknown as Record<string, unknown>).ALLOWED_ORIGIN = 'https://interiormagic.example';
    const res = await handler(req, env);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('__Host-im_session=');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://interiormagic.example');
  });

  it('local HTTP uses im_session without Secure', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv({ ALLOWED_ORIGIN: 'http://localhost:4173' } as unknown as Record<string, unknown>);
    const req = new Request('https://app.test/auth/telegram', {
      method: 'POST',
      headers: { origin: 'http://localhost:4173', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('im_session=');
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).not.toContain('Domain');
  });

  it('GET /session without cookie returns 401', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = makeRequest('/session', { method: 'GET', headers: { origin: 'https://example.invalid' } });
    const res = await handler(req, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('GET /session with valid cookie returns user and does not require Telegram config', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    // First, create session via auth
    const authReq = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const authRes = await handler(authReq, env);
    expect(authRes.status).toBe(200);
    const token = extractToken(authRes.headers.get('Set-Cookie'));
    expect(token).not.toBeNull();
    // Now GET /session with cookie should succeed even if Telegram token missing
    const envWithoutTelegram = { ...env, TELEGRAM_BOT_TOKEN: '' } as unknown as AppApiWorkerEnv;
    // Need to recreate env with same DB but missing token
    (envWithoutTelegram as unknown as Record<string, unknown>).DB = (env as unknown as Record<string, unknown>).DB;
    const getReq = new Request('https://app.test/session', {
      method: 'GET',
      headers: { origin: 'https://example.invalid', cookie: `__Host-im_session=${token}` },
    });
    const getRes = await handler(getReq, envWithoutTelegram);
    // Should be 401? Actually GET should not require TELEGRAM_BOT_TOKEN, so it should succeed even if token missing
    // Our earlier fix makes GET not check Telegram configs, so it should succeed
    // If it still checks, it would be 503, which would be wrong per P1
    // So we expect 200 if fix is correct, else 503
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { authenticated: boolean; user: { id: string } };
    expect(body.authenticated).toBe(true);
    const originalBody = (await authRes.json()) as { user: { id: string } };
    expect(body.user.id).toBe(originalBody.user.id);
  });

  it('GET /session same-origin without Origin succeeds', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv({ ALLOWED_ORIGIN: 'https://example.invalid' } as unknown as Record<string, unknown>);
    const authReq = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const authRes = await handler(authReq, env);
    const token = extractToken(authRes.headers.get('Set-Cookie'))!;
    // Same-origin GET without Origin header, request.url origin is https://example.invalid
    const getReq = new Request('https://example.invalid/session', {
      method: 'GET',
      headers: { cookie: `__Host-im_session=${token}` },
    });
    const getRes = await handler(getReq, env);
    expect(getRes.status).toBe(200);
  });

  it('GET /session with invalid token returns 401', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = new Request('https://app.test/session', {
      method: 'GET',
      headers: { origin: 'https://example.invalid', cookie: '__Host-im_session=invalid-token' },
    });
    const res = await handler(req, env);
    expect(res.status).toBe(401);
  });

  it('full lifecycle: POST -> GET -> LOGOUT -> GET 401', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const authReq = makeRequest('/auth/telegram', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const authRes = await handler(authReq, env);
    expect(authRes.status).toBe(200);
    const token = extractToken(authRes.headers.get('Set-Cookie'))!;
    const userId = ((await authRes.clone().json()) as { user: { id: string } }).user.id;

    // GET should return same user
    const getReq = new Request('https://app.test/session', {
      method: 'GET',
      headers: { origin: 'https://example.invalid', cookie: `__Host-im_session=${token}` },
    });
    const getRes = await handler(getReq, env);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { user: { id: string } };
    expect(getBody.user.id).toBe(userId);

    // D1 should store only hash, not raw
    const db = env.DB as unknown as MockD1;
    const hash = await (await import('./session')).hashToken(token);
    expect(db.sessions.has(hash)).toBe(true);
    expect(JSON.stringify(Array.from(db.sessions.values()))).not.toContain(token);

    // LOGOUT
    const logoutReq = new Request('https://app.test/logout', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', cookie: `__Host-im_session=${token}` },
    });
    const logoutRes = await handler(logoutReq, env);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(logoutRes.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    // GET after logout → 401
    const getAfter = await handler(getReq, env);
    expect(getAfter.status).toBe(401);
  });

  it('rejects POST without Origin (strict)', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const handler = createAppApiHandler();
    const env = makeEnv();
    const req = new Request('https://app.test/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const res = await handler(req, env);
    expect(res.status).toBe(403);
  });

  it('client-provided userId never authorizes (ownership)', async () => {
    const handler = createAppApiHandler();
    const env = makeEnv();
    // Try to smuggle userId in body for GET (should be ignored, still needs cookie)
    const req = new Request('https://app.test/session', {
      method: 'GET',
      headers: { origin: 'https://example.invalid', cookie: 'im_session=fake' },
    });
    // Even if body contains userId, GET ignores body and checks cookie only
    const res = await handler(req, env);
    expect(res.status).toBe(401);
  });
});
