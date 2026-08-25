export type TelegramVerificationErrorCode = 'invalid_init_data' | 'init_data_expired' | 'server_misconfigured';

export class TelegramVerificationError extends Error {
  code: TelegramVerificationErrorCode;
  constructor(code: TelegramVerificationErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'TelegramVerificationError';
  }
}

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const timingSafeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export interface TelegramVerificationResult {
  providerSubject: string;
  authDate: number;
}

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<TelegramVerificationResult> {
  if (typeof initData !== 'string' || initData.length === 0) throw new TelegramVerificationError('invalid_init_data');
  if (typeof botToken !== 'string' || botToken.length === 0) throw new TelegramVerificationError('server_misconfigured', 'missing bot token');
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) throw new TelegramVerificationError('server_misconfigured', 'invalid max age');

  // Parse query string with duplicate detection and percent-decoding.
  const entries: Array<[string, string]> = [];
  const seen = new Set<string>();
  const parts = initData.split('&');
  for (const part of parts) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawVal = eq === -1 ? '' : part.slice(eq + 1);
    let key: string;
    let val: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      val = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch {
      throw new TelegramVerificationError('invalid_init_data', 'malformed percent encoding');
    }
    if (seen.has(key)) throw new TelegramVerificationError('invalid_init_data', `duplicate key: ${key}`);
    seen.add(key);
    entries.push([key, val]);
  }

  const hashEntry = entries.find(([k]) => k === 'hash');
  if (!hashEntry) throw new TelegramVerificationError('invalid_init_data', 'missing hash');
  const hash = hashEntry[1];
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new TelegramVerificationError('invalid_init_data', 'invalid hash format');

  const authDateEntry = entries.find(([k]) => k === 'auth_date');
  if (!authDateEntry) throw new TelegramVerificationError('invalid_init_data', 'missing auth_date');
  const authDateRaw = authDateEntry[1];
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate) || authDate < 0) throw new TelegramVerificationError('invalid_init_data', 'invalid auth_date');
  // Freshness: auth_date must be within maxAgeSeconds in the past and not too far in future (30s skew)
  if (nowSeconds - authDate > maxAgeSeconds) throw new TelegramVerificationError('init_data_expired', 'stale');
  if (authDate - nowSeconds > 30) throw new TelegramVerificationError('init_data_expired', 'future skew');

  const userEntry = entries.find(([k]) => k === 'user');
  if (!userEntry) throw new TelegramVerificationError('invalid_init_data', 'missing user');
  let userObj: unknown;
  try {
    userObj = JSON.parse(userEntry[1]);
  } catch {
    throw new TelegramVerificationError('invalid_init_data', 'malformed user JSON');
  }
  if (typeof userObj !== 'object' || userObj === null || Array.isArray(userObj)) throw new TelegramVerificationError('invalid_init_data', 'user not object');
  const userId = (userObj as Record<string, unknown>).id;
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0) throw new TelegramVerificationError('invalid_init_data', 'invalid user id');
  const providerSubject = String(userId);

  // Build data_check_string from all entries except hash, sorted by key lexically, using decoded values.
  const filtered = entries.filter(([k]) => k !== 'hash');
  filtered.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = filtered.map(([k, v]) => `${k}=${v}`).join('\n');

  // HMAC per Telegram docs: secret_key = HMAC(key="WebAppData", data=botToken)
  const webAppDataKey = await crypto.subtle.importKey(
    'raw',
    utf8('WebAppData') as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secretKeyBytes = await crypto.subtle.sign('HMAC', webAppDataKey, utf8(botToken) as unknown as ArrayBuffer);
  const secretKey = await crypto.subtle.importKey('raw', secretKeyBytes as unknown as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedBytes = await crypto.subtle.sign('HMAC', secretKey, utf8(dataCheckString) as unknown as ArrayBuffer);
  const expectedHex = toHex(expectedBytes);

  if (!timingSafeEqualHex(expectedHex.toLowerCase(), hash.toLowerCase())) throw new TelegramVerificationError('invalid_init_data', 'hash mismatch');

  return { providerSubject, authDate };
}

export function parseMaxAgeEnv(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return num;
}
