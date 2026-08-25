import { test, expect } from './fixtures';
import { openApp } from './helpers';

test('H2: outside Telegram remains anonymous and editor stays usable', async ({ monitoredPage: page }) => {
  // No Telegram mock, no endpoint -> anonymous
  await openApp(page);
  const snap = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getIdentitySnapshot());
  expect(snap.state).toBe('anonymous');
  expect(snap.userId).toBeUndefined();
  await expect(page.locator('canvas')).toBeVisible();
  const project = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(project.version).toBe(1);
});

test('H2: valid mocked response becomes authenticated without blocking editor', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    // Provide endpoint via process.env fallback for E2E
    (window as unknown as Record<string, unknown>).process = {
      env: { VITE_APP_API_ENDPOINT: 'https://auth.test' },
    };
    // Mock Telegram initData with required host methods for initTelegram
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          initData: 'query_id=test&user=%7B%22id%22%3A123%7D&auth_date=123&hash=abc',
          ready: () => undefined,
          expand: () => undefined,
          isVersionAtLeast: () => true,
          requestFullscreen: () => undefined,
          viewportStableHeight: 820,
          onEvent: () => undefined,
          offEvent: () => undefined,
        },
      },
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/auth/telegram')) {
        return new Response(JSON.stringify({ user: { id: 'user-uuid-123' }, identity: { provider: 'telegram' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input as Request, init);
    };
  });
  await openApp(page);
  await expect.poll(async () => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getIdentitySnapshot().state), { timeout: 10_000 }).toBe('authenticated');
  const snap = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getIdentitySnapshot());
  expect(snap.userId).toBe('user-uuid-123');
  await expect(page.locator('canvas')).toBeVisible();
});

test('H2: backend rejection becomes failed without blocking editor', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).process = {
      env: { VITE_APP_API_ENDPOINT: 'https://auth.test' },
    };
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          initData: 'query_id=test&user=%7B%22id%22%3A123%7D&auth_date=123&hash=abc',
          ready: () => undefined,
          expand: () => undefined,
          isVersionAtLeast: () => true,
          requestFullscreen: () => undefined,
          viewportStableHeight: 820,
          onEvent: () => undefined,
          offEvent: () => undefined,
        },
      },
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/auth/telegram')) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'invalid_init_data' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input as Request, init);
    };
  });
  await openApp(page);
  await expect.poll(async () => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getIdentitySnapshot().state), { timeout: 10_000 }).toBe('failed');
  await expect(page.locator('canvas')).toBeVisible();
  const project = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(project.version).toBe(1);
});

test('H2: raw initData is not persisted in storage', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).process = {
      env: { VITE_APP_API_ENDPOINT: 'https://auth.test' },
    };
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          initData: 'query_id=secretInitData&user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc',
          ready: () => undefined,
          expand: () => undefined,
          isVersionAtLeast: () => true,
          requestFullscreen: () => undefined,
          viewportStableHeight: 820,
          onEvent: () => undefined,
          offEvent: () => undefined,
        },
      },
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/auth/telegram')) {
        return new Response(JSON.stringify({ user: { id: 'u1' }, identity: { provider: 'telegram' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input as Request, init);
    };
  });
  await openApp(page);
  await expect.poll(async () => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getIdentitySnapshot().state), { timeout: 10_000 }).toBe('authenticated');
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    snap: window.__INTERIOR_MAGIC_TEST__!.getIdentitySnapshot(),
  }));
  expect(storage.local.join(',')).not.toContain('initData');
  expect(storage.session.join(',')).not.toContain('initData');
  expect((storage.snap as unknown as Record<string, unknown>).initData).toBeUndefined();
});
