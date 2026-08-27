import { test, expect } from './fixtures';
import { openApp, project } from './helpers';

const wireSyncHarness = async (page: import('@playwright/test').Page, mode: 'create-ok' | 'stale' | 'server-error') => {
  await page.addInitScript((mockMode) => {
    (window as unknown as Record<string, unknown>).process = {
      env: { VITE_APP_API_ENDPOINT: 'https://auth.test' },
    };
    const counters = { post: 0, put: 0 };
    (window as unknown as Record<string, unknown>).__h3bCounters = counters;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/projects')) {
        if ((init?.method ?? 'GET') === 'POST') counters.post += 1;
        if ((init?.method ?? '') === 'PUT') counters.put += 1;
        const metadata = { id: '11111111-2222-4333-8444-555555555555', schemaVersion: 1, revision: mockMode === 'stale' ? 9 : counters.post + counters.put, createdAt: 1, updatedAt: 1 };
        if (mockMode === 'server-error') return new Response(JSON.stringify({ ok: false, error: { code: 'internal_error' } }), { status: 500 });
        if (mockMode === 'stale') return new Response(JSON.stringify({ ok: false, error: { code: 'stale_revision' } }), { status: 409 });
        return new Response(JSON.stringify({ ok: true, metadata }), { status: 200 });
      }
      // Identity endpoints stay unauthenticated in this harness.
      if (url.includes('/session')) return new Response(JSON.stringify({ ok: false, error: { code: 'unauthenticated' } }), { status: 401 });
      if (url.includes('/auth/telegram')) return new Response(JSON.stringify({ user: { id: 'user-uuid-123' }, identity: { provider: 'telegram' } }), { status: 200 });
      return originalFetch(input as Request, init);
    };
  }, mode);
};

const counters = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const raw = (window as unknown as Record<string, unknown>).__h3bCounters as { post: number; put: number };
    return { ...raw };
  });

test('H3B: authenticated explicit Save attaches the project exactly once', async ({ monitoredPage: page }) => {
  await wireSyncHarness(page, 'create-ok');
  await page.addInitScript(() => {
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          initData: 'query_id=test&user=%7B%22id%22%3A123%7D&auth_date=9999999999&hash=abc',
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
  });
  await openApp(page);

  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect.poll(async () => (await counters(page)).post).toBe(1);
  const saved = await project(page);
  expect(saved.version).toBe(1);

  // Second explicit save with no changes must NOT create a second project.
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect.poll(async () => (await counters(page)).post).toBe(1);
});

test('H3B: anonymous editor issues zero /projects requests', async ({ monitoredPage: page }) => {
  await wireSyncHarness(page, 'create-ok');
  await openApp(page);
  await expect(page.locator('canvas')).toBeVisible();
  const c = await counters(page);
  expect(c.post).toBe(0);
  expect(c.put).toBe(0);
});
