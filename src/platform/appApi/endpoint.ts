/** Shared App API endpoint resolution for browser clients.
 *  Extracted once (H3B) so identity bootstrap and project sync never duplicate
 *  Vite/test environment parsing. Absence of the endpoint is the feature gate:
 *  callers stay anonymous/local-only without issuing requests. */

export const resolveAppApiEndpoint = (): string | null => {
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

export const toAppApiBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/auth/telegram')) return trimmed.slice(0, -'/auth/telegram'.length);
  return trimmed;
};

/** Absolute URL for an App API path, or null when the feature is disabled. */
export const resolveAppApiUrl = (path: string): string | null => {
  const endpoint = resolveAppApiEndpoint();
  if (endpoint === null) return null;
  return `${toAppApiBaseUrl(endpoint)}${path}`;
};
