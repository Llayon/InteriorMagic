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
