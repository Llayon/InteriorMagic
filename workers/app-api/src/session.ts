export const MAX_TTL_SECONDS = 31_536_000; // 365 days upper bound
export const DEFAULT_TTL_SECONDS = 2_592_000; // 30 days

export function parseSessionTtlEnv(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0 || num > MAX_TTL_SECONDS) return null;
  return num;
}

export interface SessionCookiePolicy {
  name: string;
  secure: boolean;
  sameSite: 'Lax';
  path: string;
}

export function sessionCookiePolicy(env: { ALLOWED_ORIGIN?: unknown }): SessionCookiePolicy | null {
  const raw = typeof env.ALLOWED_ORIGIN === 'string' ? env.ALLOWED_ORIGIN : '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== raw) return null;
  if (url.protocol === 'https:') {
    return { name: '__Host-im_session', secure: true, sameSite: 'Lax', path: '/' };
  }
  if (url.protocol === 'http:') {
    const host = url.hostname;
    // Allow localhost, 127.0.0.1, ::1 (with or without brackets)
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return { name: 'im_session', secure: false, sameSite: 'Lax', path: '/' };
    }
    return null;
  }
  return null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes); // 43 chars, transport-safe
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface SessionRow {
  id_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export async function createSession(
  db: D1Database,
  userId: string,
  now: number,
  ttlSeconds: number,
): Promise<{ rawToken: string; hash: string; expiresAt: number }> {
  const rawToken = generateSessionToken();
  const hash = await hashToken(rawToken);
  const expiresAt = now + ttlSeconds * 1000;
  await db
    .prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hash, userId, now, expiresAt)
    .run();
  return { rawToken, hash, expiresAt };
}

export async function getSessionByTokenHash(
  db: D1Database,
  hash: string,
  now: number,
): Promise<SessionRow | null> {
  const row = await db
    .prepare('SELECT id_hash, user_id, created_at, expires_at FROM sessions WHERE id_hash = ?')
    .bind(hash)
    .first<SessionRow>();
  if (!row) return null;
  if (row.expires_at <= now) {
    // Lazy delete expired
    await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run();
    return null;
  }
  return row;
}

export async function deleteSessionByTokenHash(db: D1Database, hash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run();
}

export function buildSetCookieHeader(
  policy: SessionCookiePolicy,
  token: string,
  ttlSeconds: number,
): string {
  const parts = [`${policy.name}=${token}`, `Path=${policy.path}`, 'HttpOnly', `SameSite=${policy.sameSite}`];
  if (policy.secure) parts.push('Secure');
  parts.push(`Max-Age=${ttlSeconds}`);
  // Expires for compatibility
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  parts.push(`Expires=${expires}`);
  return parts.join('; ');
}

export function buildExpiredCookieHeader(policy: SessionCookiePolicy): string {
  const parts = [`${policy.name}=`, `Path=${policy.path}`, 'HttpOnly', `SameSite=${policy.sameSite}`, 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'];
  if (policy.secure) parts.push('Secure');
  return parts.join('; ');
}

export function parseCookieHeader(cookieHeader: string | null, expectedName: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName) continue;
    if (rawName.trim() !== expectedName) continue;
    const value = rest.join('=').trim();
    // Cookie value may be quoted
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
    return value;
  }
  return null;
}
