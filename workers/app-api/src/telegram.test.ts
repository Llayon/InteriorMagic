import { describe, expect, it } from 'vitest';
import { parseMaxAgeEnv, TelegramVerificationError, verifyTelegramInitData } from './telegram';

const BOT_TOKEN = '123456:TEST_BOT_TOKEN_FOR_H2';
const MAX_AGE = 86400;

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
  // Build initData as percent-encoded query string + hash
  const encoded = filtered.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${encoded}&hash=${hash}`;
}

function makeValidParams(overrides: Record<string, string> = {}): Record<string, string> {
  const now = Math.floor(Date.now() / 1000);
  return {
    query_id: 'AAHdF6IQAAAAAA0XohDhrOrc',
    user: JSON.stringify({ id: 279058397, first_name: 'Test', last_name: 'User', username: 'testuser' }),
    auth_date: String(now),
    ...overrides,
  };
}

describe('verifyTelegramInitData', () => {
  it('accepts valid signed initData', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const result = await verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
    expect(result.providerSubject).toBe('279058397');
  });

  it('rejects tampered field', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const tampered = initData.replace('279058397', '279058398');
    await expect(verifyTelegramInitData(tampered, BOT_TOKEN, MAX_AGE)).rejects.toThrow(TelegramVerificationError);
    await expect(verifyTelegramInitData(tampered, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects wrong hash', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const wrong = initData.replace(/hash=[0-9a-f]{64}/, 'hash=' + '0'.repeat(64));
    await expect(verifyTelegramInitData(wrong, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects missing hash', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const withoutHash = initData.split('&').filter((p) => !p.startsWith('hash=')).join('&');
    await expect(verifyTelegramInitData(withoutHash, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects missing auth_date', async () => {
    const params = makeValidParams();
    delete (params as Record<string, string>).auth_date;
    const initData = await signInitData(params, BOT_TOKEN);
    // signInitData will not include auth_date, so verifier should reject missing auth_date
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects missing user', async () => {
    const params = makeValidParams();
    delete (params as Record<string, string>).user;
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects malformed user JSON', async () => {
    const params = makeValidParams({ user: '{not json' });
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects duplicate parameters (duplicate user)', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const duplicate = initData + '&user=' + encodeURIComponent(JSON.stringify({ id: 1 }));
    await expect(verifyTelegramInitData(duplicate, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects duplicate hash', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const duplicateHash = initData + '&hash=' + 'a'.repeat(64);
    await expect(verifyTelegramInitData(duplicateHash, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects stale auth_date', async () => {
    const stale = Math.floor(Date.now() / 1000) - (MAX_AGE + 100);
    const params = makeValidParams({ auth_date: String(stale) });
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'init_data_expired' });
  });

  it('rejects excessive future auth_date (>30s)', async () => {
    const future = Math.floor(Date.now() / 1000) + 31;
    const params = makeValidParams({ auth_date: String(future) });
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'init_data_expired' });
  });

  it('accepts future skew within 30s', async () => {
    const future = Math.floor(Date.now() / 1000) + 10;
    const params = makeValidParams({ auth_date: String(future) });
    const initData = await signInitData(params, BOT_TOKEN);
    const result = await verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
    expect(result.providerSubject).toBe('279058397');
  });

  it('handles user with spaces, unicode and escaped JSON', async () => {
    const user = { id: 123, first_name: 'Test User', last_name: 'Морозов 🌟', username: 'test' };
    const params = makeValidParams({ user: JSON.stringify(user) });
    const initData = await signInitData(params, BOT_TOKEN);
    const result = await verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
    expect(result.providerSubject).toBe('123');
  });

  it('handles percent-encoded characters in values', async () => {
    const params = makeValidParams({ query_id: 'abc+def', user: JSON.stringify({ id: 555 }) });
    const initData = await signInitData(params, BOT_TOKEN);
    // initData will have query_id encoded as abc%2Bdef? Actually signInitData encodes via encodeURIComponent, so verify decoding path.
    const result = await verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
    expect(result.providerSubject).toBe('555');
  });

  it('rejects malformed percent encoding', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const malformed = initData.replace('query_id=', 'query_id=%ZZ');
    await expect(verifyTelegramInitData(malformed, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects hash not 64 hex chars', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    const badHash = initData.replace(/hash=[0-9a-f]{64}/, 'hash=abc123');
    await expect(verifyTelegramInitData(badHash, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects non-numeric user id', async () => {
    const params = makeValidParams({ user: JSON.stringify({ id: '123' }) });
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('rejects float user id', async () => {
    const params = makeValidParams({ user: JSON.stringify({ id: 123.45 }) });
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });

  it('provider_subject remains decimal string', async () => {
    const params = makeValidParams({ user: JSON.stringify({ id: 999 }) });
    const initData = await signInitData(params, BOT_TOKEN);
    const result = await verifyTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
    expect(typeof result.providerSubject).toBe('string');
    expect(result.providerSubject).toBe('999');
  });

  it('wrong bot token fails', async () => {
    const params = makeValidParams();
    const initData = await signInitData(params, BOT_TOKEN);
    await expect(verifyTelegramInitData(initData, 'wrong-token', MAX_AGE)).rejects.toMatchObject({ code: 'invalid_init_data' });
  });
});

describe('parseMaxAgeEnv', () => {
  it('parses valid max age', () => {
    expect(parseMaxAgeEnv('86400')).toBe(86400);
    expect(parseMaxAgeEnv(' 86400 ')).toBe(86400);
  });
  it('rejects invalid', () => {
    expect(parseMaxAgeEnv('')).toBeNull();
    expect(parseMaxAgeEnv('0')).toBeNull();
    expect(parseMaxAgeEnv('-1')).toBeNull();
    expect(parseMaxAgeEnv('abc')).toBeNull();
    expect(parseMaxAgeEnv(undefined)).toBeNull();
  });
});
