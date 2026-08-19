import { expect, type Page } from '@playwright/test';

export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady())).toBe(true);
}

export async function project(page: Page) {
  return page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
}

export async function addAsset(page: Page, category: string, assetId: string) {
  const before = (await project(page)).objects.length;
  await page.getByRole('button', { name: `Category ${category}` }).click();
  await page.locator(`[data-asset-id="${assetId}"]`).click();
  await expect.poll(async () => (await project(page)).objects.length).toBe(before + 1);
  return (await project(page)).objects.at(-1)!;
}

export async function proxyBounds(page: Page, instanceId: string) {
  const bounds = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getInteractionProxyScreenBounds(id), instanceId);
  expect(bounds).not.toBeNull();
  return bounds!;
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
