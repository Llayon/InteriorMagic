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

export const bootstrapIdentity = async (): Promise<void> => {
  const endpoint = ENDPOINT_ENV();
  const initData = getTelegramInitData();

  // Feature gate: missing endpoint or missing initData => anonymous, no request, editor usable.
  if (!endpoint || !initData) {
    identityStore.setState('anonymous', undefined);
    return;
  }

  identityStore.setState('authenticating', undefined);

  try {
    const url = endpoint.endsWith('/auth/telegram') ? endpoint : `${endpoint.replace(/\/+$/, '')}/auth/telegram`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    if (
      typeof data !== 'object' ||
      data === null ||
      !('user' in data) ||
      typeof (data as Record<string, unknown>).user !== 'object' ||
      (data as Record<string, unknown>).user === null
    ) {
      identityStore.setState('failed', undefined);
      return;
    }
    const user = (data as { user: { id?: unknown } }).user;
    if (typeof user.id !== 'string' || user.id.length === 0) {
      identityStore.setState('failed', undefined);
      return;
    }
    // Keep internal user ID in memory only, do not persist raw initData.
    identityStore.setState('authenticated', user.id);
  } catch {
    identityStore.setState('failed', undefined);
  }
};

// Non-blocking fire-and-forget wrapper for bootstrap phase.
export const initIdentity = (): void => {
  void bootstrapIdentity();
};

export const __getEndpointForTests = (): string | null => ENDPOINT_ENV();
