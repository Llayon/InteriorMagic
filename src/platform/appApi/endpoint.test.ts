import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAppApiEndpoint, resolveAppApiUrl, toAppApiBaseUrl } from './endpoint';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('resolveAppApiEndpoint', () => {
  it('reads the Vite env first and trims', () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', '  https://api.example  ');
    expect(resolveAppApiEndpoint()).toBe('https://api.example');
  });

  it('falls back to the test process shim used by E2E init scripts', () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', '');
    vi.stubGlobal('process', { env: { VITE_APP_API_ENDPOINT: 'https://auth.test' } });
    expect(resolveAppApiEndpoint()).toBe('https://auth.test');
  });

  it('treats absence or blank as feature-disabled', () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', '   ');
    vi.stubGlobal('process', { env: {} });
    expect(resolveAppApiEndpoint()).toBeNull();
  });
});

describe('toAppApiBaseUrl', () => {
  it('accepts both base urls and full auth endpoints', () => {
    expect(toAppApiBaseUrl('https://api.example')).toBe('https://api.example');
    expect(toAppApiBaseUrl('https://api.example/')).toBe('https://api.example');
    expect(toAppApiBaseUrl('https://api.example/auth/telegram')).toBe('https://api.example');
  });
});

describe('resolveAppApiUrl', () => {
  it('builds absolute paths when enabled and null when disabled', () => {
    vi.stubEnv('VITE_APP_API_ENDPOINT', 'https://auth.test/auth/telegram');
    expect(resolveAppApiUrl('/session')).toBe('https://auth.test/session');
    expect(resolveAppApiUrl('/projects')).toBe('https://auth.test/projects');
    vi.stubEnv('VITE_APP_API_ENDPOINT', '');
    expect(resolveAppApiUrl('/projects')).toBeNull();
  });
});
