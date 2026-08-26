import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapIdentity } from './client';
import { __resetIdentityForTests, getIdentitySnapshot } from './store';

const BOT_TOKEN = '123456:TEST';

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

describe('bootstrapIdentity', () => {
  beforeEach(() => {
    __resetIdentityForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    __resetIdentityForTests();
    vi.unstubAllGlobals();
  });

  it('remains anonymous outside Telegram (no initData)', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    vi.stubGlobal('window', {});
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'anonymous' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const firstCall = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, RequestInit];
    expect(firstCall[0]).toContain('/session');
    expect(firstCall[1]?.credentials).toBe('include');
  });

  it('remains anonymous when endpoint missing (feature disabled)', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', '');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'anonymous' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('becomes authenticated on valid mocked response', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    const mockUserId = 'user-uuid-123';
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/auth/telegram')) {
        // Check credentials include
        expect(init?.credentials).toBe('include');
        return new Response(JSON.stringify({ user: { id: mockUserId }, identity: { provider: 'telegram' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'authenticated', userId: mockUserId });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]![0]).toContain('/session');
    expect(calls[0]![1]?.credentials).toBe('include');
    expect(calls[1]![0]).toContain('/auth/telegram');
    expect(calls[1]![1]?.credentials).toBe('include');
    expect(calls[1]![1]?.body).toBe(JSON.stringify({ initData }));
    expect(getIdentitySnapshot().userId).toBe(mockUserId);
  });

  it('becomes failed on backend rejection without blocking editor', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/auth/telegram')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'invalid_init_data' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'failed' });
    const { useEditorStore } = await import('@/editor/state/store');
    expect(useEditorStore.getState().project.version).toBe(1);
  });

  it('does not persist raw initData', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401 });
      }
      if (url.includes('/auth/telegram')) {
        return new Response(JSON.stringify({ user: { id: 'u1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    const snap = getIdentitySnapshot();
    expect(snap).not.toHaveProperty('initData');
    if (typeof localStorage !== 'undefined') expect(localStorage.getItem('initData')).toBeNull();
  });

  it('existing valid session: GET /session succeeds and POST not called', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData: 'query_id=abc&user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc' } } });
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        return new Response(JSON.stringify({ authenticated: true, user: { id: 'existing-user' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'authenticated', userId: 'existing-user' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('/session');
  });

  it('no session + Telegram initData: GET 401 then POST', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401 });
      }
      if (url.includes('/auth/telegram')) {
        return new Response(JSON.stringify({ user: { id: 'new-user' } }), { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'authenticated', userId: 'new-user' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses credentials:include for both requests', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/session')) {
        expect(init?.credentials).toBe('include');
        return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401 });
      }
      if (url.includes('/auth/telegram')) {
        expect(init?.credentials).toBe('include');
        return new Response(JSON.stringify({ user: { id: 'u1' } }), { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot().state).toBe('authenticated');
  });
});
