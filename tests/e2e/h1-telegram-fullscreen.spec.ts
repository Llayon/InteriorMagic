import { test, expect } from './fixtures';
import { openApp } from './helpers';

test('H1: supported Telegram host requests fullscreen exactly once (expand fallback preserved)', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    const events = new Map<string, (p?: unknown) => void>();
    (window as unknown as Record<string, unknown>).__h1Calls = calls;
    (window as unknown as Record<string, unknown>).__h1Events = events;
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          isExpanded: false,
          isFullscreen: false,
          viewportStableHeight: 820,
          viewportHeight: 780,
          contentSafeAreaInset: { top: 24, right: 13, bottom: 18, left: 11 },
          ready: () => calls.push('ready'),
          expand: () => calls.push('expand'),
          setHeaderColor: () => calls.push('header'),
          setBackgroundColor: () => calls.push('background'),
          isVersionAtLeast: (v: string) => v === '8.0',
          requestFullscreen: () => calls.push('requestFullscreen'),
          exitFullscreen: () => calls.push('exitFullscreen'),
          onEvent: (e: string, cb: (p?: unknown) => void) => events.set(e, cb),
          offEvent: (e: string) => events.delete(e),
        },
      },
    });
  });
  await openApp(page);
  const calls = await page.evaluate(() => (window as unknown as { __h1Calls: string[] }).__h1Calls);
  expect(calls).toEqual(expect.arrayContaining(['ready', 'expand']));
  expect(calls.filter((c) => c === 'requestFullscreen')).toHaveLength(1);
  const events = await page.evaluate(() => Object.keys((window as unknown as { __h1Events: Map<string, unknown> }).__h1Events ? Object.fromEntries((window as unknown as { __h1Events: Map<string, unknown> }).__h1Events) : {}));
  expect(events).toEqual(expect.arrayContaining(['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'fullscreenFailed']));
});

test('H1: pre-8.0 host remains expand-only (no fullscreen)', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as Record<string, unknown>).__h1Calls = calls;
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '7.5',
          isExpanded: false,
          isFullscreen: false,
          viewportStableHeight: 820,
          ready: () => calls.push('ready'),
          expand: () => calls.push('expand'),
          isVersionAtLeast: () => false,
          requestFullscreen: () => calls.push('requestFullscreen'),
          onEvent: () => undefined,
          offEvent: () => undefined,
        },
      },
    });
  });
  await openApp(page);
  const calls = await page.evaluate(() => (window as unknown as { __h1Calls: string[] }).__h1Calls);
  expect(calls).toEqual(expect.arrayContaining(['ready', 'expand']));
  expect(calls.filter((c) => c === 'requestFullscreen')).toHaveLength(0);
});

test('H1: already fullscreen host does not request', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as Record<string, unknown>).__h1Calls = calls;
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          isExpanded: true,
          isFullscreen: true,
          ready: () => calls.push('ready'),
          expand: () => calls.push('expand'),
          isVersionAtLeast: () => true,
          requestFullscreen: () => calls.push('requestFullscreen'),
          onEvent: () => undefined,
          offEvent: () => undefined,
        },
      },
    });
  });
  await openApp(page);
  const calls = await page.evaluate(() => (window as unknown as { __h1Calls: string[] }).__h1Calls);
  expect(calls.filter((c) => c === 'requestFullscreen')).toHaveLength(0);
  expect(calls.filter((c) => c === 'expand')).toHaveLength(0);
});

test('H1: fullscreenFailed UNSUPPORTED keeps app usable and does not retry', async ({ monitoredPage: page }, testInfo) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    const events = new Map<string, (p?: unknown) => void>();
    (window as unknown as Record<string, unknown>).__h1Calls = calls;
    (window as unknown as Record<string, unknown>).__h1Events = events;
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          isExpanded: false,
          isFullscreen: false,
          viewportStableHeight: 820,
          contentSafeAreaInset: { top: 24, bottom: 18 },
          ready: () => calls.push('ready'),
          expand: () => calls.push('expand'),
          isVersionAtLeast: () => true,
          requestFullscreen: () => calls.push('requestFullscreen'),
          onEvent: (e: string, cb: (p?: unknown) => void) => events.set(e, cb),
          offEvent: (e: string) => events.delete(e),
        },
      },
    });
  });
  await openApp(page);
  await page.evaluate(() => {
    const events = (window as unknown as { __h1Events: Map<string, (p?: unknown) => void> }).__h1Events;
    events.get('fullscreenFailed')?.({ error: 'UNSUPPORTED' });
  });
  const calls = await page.evaluate(() => (window as unknown as { __h1Calls: string[] }).__h1Calls);
  expect(calls.filter((c) => c === 'requestFullscreen')).toHaveLength(1);
  await expect(page.locator('canvas')).toBeVisible();
  // On desktop the stable viewport does not drive scene geometry (grid layout), so only check CSS var.
  const cssHeight = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-stable-height').trim());
  expect(cssHeight).toBe('820px');
  if (testInfo.project.name !== 'desktop') {
    const geometry = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getWorkspaceGeometry()!);
    expect(geometry.height).toBe(820);
  }
});

test('H1: fullscreenChanged refreshes geometry and safe-area', async ({ monitoredPage: page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'safe-area regression is mobile-specific');
  await page.addInitScript(() => {
    const events = new Map<string, (p?: unknown) => void>();
    (window as unknown as Record<string, unknown>).__h1Events = events;
    Object.assign(window, {
      Telegram: {
        WebApp: {
          platform: 'ios',
          version: '8.0',
          isExpanded: false,
          isFullscreen: false,
          viewportStableHeight: 820,
          contentSafeAreaInset: { top: 24, right: 13, bottom: 18, left: 11 },
          ready: () => undefined,
          expand: () => undefined,
          isVersionAtLeast: () => true,
          requestFullscreen: () => undefined,
          onEvent: (e: string, cb: (p?: unknown) => void) => events.set(e, cb),
          offEvent: (e: string) => events.delete(e),
        },
      },
    });
  });
  await openApp(page);
  const before = await page.evaluate(() => ({
    cssTop: getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-top'),
    geometry: window.__INTERIOR_MAGIC_TEST__!.getWorkspaceGeometry()!,
  }));
  expect(before.cssTop.trim()).toBe('24px');
  expect(before.geometry.height).toBe(820);

  await page.evaluate(() => {
    const tg = (window as unknown as { Telegram: { WebApp: Record<string, unknown> } }).Telegram.WebApp;
    tg.contentSafeAreaInset = { top: 60, right: 0, bottom: 0, left: 0 };
    tg.viewportStableHeight = 900 as unknown as number;
    const events = (window as unknown as { __h1Events: Map<string, (p?: unknown) => void> }).__h1Events;
    events.get('fullscreenChanged')?.();
  });

  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-top').trim())).toBe('60px');
  const after = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getWorkspaceGeometry()!);
  expect(after.height).toBe(900);
});

test('H1: ordinary browser (no Telegram) remains safe no-op', async ({ monitoredPage: page }) => {
  // No Telegram mock - default browser
  await openApp(page);
  await expect(page.locator('canvas')).toBeVisible();
  const state = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getWorkspaceGeometry()!);
  expect(state.width).toBeGreaterThan(0);
});
