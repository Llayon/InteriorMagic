import { getTelegramInitData } from '@/platform/telegram/host';
import { identityStore } from './store';

const ENDPOINT_ENV = (): string | null => {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_APP_API_ENDPOINT;
    const procEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_APP_API_ENDPOINT;
    const raw = typeof metaEnv === 'string' ? metaEnv : typeof procEnv === 'string' ? procEnv : null;
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  } catch {
    return null;
  }
};

const toBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/auth/telegram')) return trimmed.slice(0, -'/auth/telegram'.length);
  return trimmed;
};

const parseUserId = (data: unknown): string | null => {
  if (typeof data !== 'object' || data === null) return null;
  if (!('user' in data)) return null;
  const user = (data as Record<string, unknown>).user;
  if (typeof user !== 'object' || user === null) return null;
  const id = (user as { id?: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) return null;
  return id;
};

export const bootstrapIdentity = async (): Promise<void> => {
  const endpoint = ENDPOINT_ENV();
  if (!endpoint) {
    identityStore.setState('anonymous', undefined);
    return;
  }
  const base = toBaseUrl(endpoint);
  const sessionUrl = `${base}/session`;
  const authUrl = `${base}/auth/telegram`;

  identityStore.setState('authenticating', undefined);

  // 1. Try existing cookie session — only 401 continues to Telegram bootstrap
  try {
    const sessionRes = await fetch(sessionUrl, {
      method: 'GET',
      credentials: 'include',
    });
    if (sessionRes.ok) {
      let data: unknown;
      try {
        data = await sessionRes.json();
      } catch {
        identityStore.setState('failed', undefined);
        return;
      }
      if (
        typeof data === 'object' &&
        data !== null &&
        (data as Record<string, unknown>).authenticated === true
      ) {
        const userId = parseUserId(data);
        if (userId) {
          identityStore.setState('authenticated', userId);
          return;
        }
      }
      // 200 but malformed → failed, do not create new session
      identityStore.setState('failed', undefined);
      return;
    }
    if (sessionRes.status === 401) {
      // Unauthenticated → continue to Telegram bootstrap check below
    } else {
      // 403, 500, etc. → failed, do not create new session
      identityStore.setState('failed', undefined);
      return;
    }
  } catch {
    // Network error → failed, do not create new session
    identityStore.setState('failed', undefined);
    return;
  }

  const initData = getTelegramInitData();
  if (!initData) {
    identityStore.setState('anonymous', undefined);
    return;
  }

  try {
    const res = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ initData }),
    });
    if (!res.ok) {
      identityStore.setState('failed', undefined);
      return;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      identityStore.setState('failed', undefined);
      return;
    }
    const userId = parseUserId(data);
    if (!userId) {
      identityStore.setState('failed', undefined);
      return;
    }
    identityStore.setState('authenticated', userId);
  } catch {
    identityStore.setState('failed', undefined);
  }
};

// Non-blocking fire-and-forget wrapper for bootstrap phase.
export const initIdentity = (): void => {
  void bootstrapIdentity();
};

export const __getEndpointForTests = (): string | null => ENDPOINT_ENV();
export const __toBaseUrlForTests = (endpoint: string): string => toBaseUrl(endpoint);
