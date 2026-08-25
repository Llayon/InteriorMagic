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
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'anonymous' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
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
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: mockUserId }, identity: { provider: 'telegram' } }) } as Response) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'authenticated', userId: mockUserId });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(fetchCall[0]).toContain('/auth/telegram');
    expect(fetchCall[1].body).toBe(JSON.stringify({ initData }));
    // raw initData not persisted in store beyond request
    expect(getIdentitySnapshot().userId).toBe(mockUserId);
  });

  it('becomes failed on backend rejection without blocking editor', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ ok: false, error: { code: 'invalid_init_data' } }) } as Response) as unknown as typeof fetch;
    await bootstrapIdentity();
    expect(getIdentitySnapshot()).toEqual({ state: 'failed' });
    // editor still usable: check editor store not corrupted
    const { useEditorStore } = await import('@/editor/state/store');
    expect(useEditorStore.getState().project.version).toBe(1);
  });

  it('does not persist raw initData', async () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://example.invalid');
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    vi.stubGlobal('window', { Telegram: { WebApp: { platform: 'ios', initData } } });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'u1' } }) } as Response) as unknown as typeof fetch;
    await bootstrapIdentity();
    // store only has userId, not initData
    const snap = getIdentitySnapshot();
    expect(snap).not.toHaveProperty('initData');
    // ensure localStorage not used for initData if present
    if (typeof localStorage !== 'undefined') expect(localStorage.getItem('initData')).toBeNull();
  });
});
