import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('large active categories remain inside the existing workspace', async ({ page }, testInfo) => {
  await mkdir('visual-evidence', { recursive: true });
  await page.goto('/?registry=ithappy&debug=1');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
  const isDesktop = testInfo.project.name === 'desktop';
  if (!isDesktop) await page.getByRole('button', { name: 'Expand panel' }).click();
  await page.locator('[data-category-id="decor"]').click();
  await expect(page.locator('.item')).toHaveCount(231);
  await expect(page.locator('.item img').first()).toBeVisible();
  await page.locator('.items').evaluate((element) => { element.scrollTop = Math.min(element.scrollHeight, element.clientHeight * 3); });
  await expect(page.locator('.item img').nth(Math.min(20, await page.locator('.item img').count() - 1))).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sheet = await page.getByTestId('workspace-sheet').boundingBox();
  const viewport = testInfo.project.use.viewport!;
  expect(sheet && sheet.x >= -1 && sheet.x + sheet.width <= viewport.width + 1 && sheet.y >= -1 && sheet.y + sheet.height <= viewport.height + 1).toBe(true);
  const smallestCategoryHeight = await page.locator('.categories button').evaluateAll((buttons) => Math.min(...buttons.map((button) => button.getBoundingClientRect().height)));
  expect(smallestCategoryHeight).toBeGreaterThanOrEqual(40);
  const categoryRailHeight = await page.locator('.categories').evaluate((element) => element.getBoundingClientRect().height);
  expect(categoryRailHeight).toBeGreaterThanOrEqual(40);
  if (!isDesktop) {
    const columns = await page.locator('.items').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(columns).toBe(3);
  }
  await page.screenshot({ path: `visual-evidence/ithappy-full-${testInfo.project.name}-decor.png` });

  await page.locator('[data-category-id="architecture"]').click();
  await expect(page.locator('.item')).toHaveCount(186);
  await expect(page.locator('.item').first()).toBeDisabled();
});
