import { test, expect } from './fixtures';
import { openApp, project } from './helpers';

test('loads the editor and demand-rendered room', async ({ monitoredPage: page }) => {
  await openApp(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('catalog')).toBeVisible();
  const state = await project(page);
  expect(state.version).toBe(1);
  expect(state.room).toEqual({ width: 4, depth: 5, height: 2.7 });
  const renderer = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRendererStats());
  expect(renderer.ready).toBe(true);
  expect(renderer.frameloop).toBe('demand');
  expect(renderer.dpr).toBeLessThanOrEqual(1.5);
  expect(renderer.canvas?.width).toBeGreaterThan(0);
});

test('boots against a Telegram WebApp mock', async ({ monitoredPage: page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, {
      __telegramCalls: calls,
      Telegram: { WebApp: { ready: () => calls.push('ready'), expand: () => calls.push('expand'), setHeaderColor: () => calls.push('header'), setBackgroundColor: () => calls.push('background') } },
    });
  });
  await openApp(page);
  const calls = await page.evaluate(() => (window as unknown as { __telegramCalls: string[] }).__telegramCalls);
  expect(calls).toEqual(expect.arrayContaining(['ready', 'expand']));
});

test('shares Telegram safe-area geometry with layout and camera fitting', async ({ monitoredPage: page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'safe-area regression is mobile-specific');
  await page.addInitScript(() => Object.assign(window, { Telegram: { WebApp: {
    viewportStableHeight: 820,
    contentSafeAreaInset: { top: 24, right: 13, bottom: 18, left: 11 },
    ready: () => undefined, expand: () => undefined, onEvent: () => undefined,
  } } }));
  await openApp(page);
  const geometry = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getWorkspaceGeometry()!);
  expect(geometry.height).toBe(820); expect(geometry.insets.left).toBe(11); expect(geometry.insets.right).toBe(13); expect(geometry.insets.bottom).toBeGreaterThan(150);
  const css = await page.evaluate(() => ({ left: getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-left'), bottom: getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-bottom') }));
  expect(css).toEqual({ left: '11px', bottom: '18px' });
  // Trigger the user-facing canonical fit after the mocked Telegram geometry is observable.
  // This removes the race between initial Canvas mount and Telegram's safe-area measurement.
  await page.getByRole('button', { name: 'Fit Room' }).click();
  await expect.poll(async () => { const room = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRoomScreenBounds()); const current = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getWorkspaceGeometry()!); return room ? room.y + room.height <= current.height - current.insets.bottom + 2 : false; }, { timeout: 15_000 }).toBe(true);
});
