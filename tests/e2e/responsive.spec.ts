import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { addAsset, openApp } from './helpers';

async function expectInsideViewport(page: Page, locator: Locator, name: string) {
  await expect(locator, `${name} visible`).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width, `${name} width`).toBeGreaterThan(0);
  expect(box!.height, `${name} height`).toBeGreaterThan(0);
  expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height + 1);
  return box!;
}

test('keeps the mobile workspace usable inside the viewport', async ({ monitoredPage: page }, testInfo) => {
  await openApp(page);
  for (const [name, locator] of Object.entries({ header: page.getByTestId('app-header'), catalog: page.getByTestId('catalog'), scene: page.getByTestId('scene'), undo: page.getByRole('button', { name: 'Undo' }), canvas: page.locator('canvas') })) {
    await expectInsideViewport(page, locator, name);
  }
  const canvas = await page.locator('canvas').boundingBox();
  expect(canvas!.height).toBeGreaterThanOrEqual(150);
  if (testInfo.project.name === 'mobile-short') await expect(page.locator('.hint')).toBeHidden();

  await page.getByRole('button', { name: 'Category chairs' }).click();
  await expect(page.getByRole('button', { name: 'Category chairs' })).toHaveClass(/active/);
  await addAsset(page, 'chairs', 'chair');
  const toolbar = await expectInsideViewport(page, page.locator('.toolbar'), 'toolbar');
  const catalog = await page.getByTestId('catalog').boundingBox();
  const isMobile = testInfo.project.name !== 'desktop';
  if (isMobile) expect(toolbar.y + toolbar.height, 'toolbar above catalog').toBeLessThanOrEqual(catalog!.y + 1);

  const criticalTargets = {
    rotate: page.getByRole('button', { name: 'Rotate right' }),
    delete: page.getByRole('button', { name: 'Delete' }),
    project: page.getByRole('button', { name: 'Project menu' }),
    materials: page.getByRole('button', { name: 'Materials' }),
    category: page.getByRole('button', { name: 'Category chairs' }),
  };
  if (isMobile) for (const [name, locator] of Object.entries(criticalTargets)) {
      const box = await locator.boundingBox();
      expect(box!.width, `${name} touch width`).toBeGreaterThanOrEqual(40);
      expect(box!.height, `${name} touch height`).toBeGreaterThanOrEqual(40);
    }

  await page.getByRole('button', { name: 'Materials' }).click();
  await expectInsideViewport(page, page.locator('.finish-pop'), 'materials popup');
  await expect(page.locator('.finish-pop .swatches button')).toHaveCount(6);
  await page.getByRole('button', { name: 'Materials' }).click();

  await page.getByRole('button', { name: 'Project menu' }).click();
  await expectInsideViewport(page, page.locator('.project-pop'), 'project menu');
  for (const name of ['Save project', 'Load project', 'Reset project']) await expect(page.getByRole('button', { name })).toBeVisible();

  const item = await page.locator('.item').first().boundingBox();
  const viewport = page.viewportSize()!;
  const visibleHeight = Math.min(item!.y + item!.height, viewport.height) - Math.max(item!.y, 0);
  expect(item!.x).toBeGreaterThanOrEqual(0);
  expect(item!.x + item!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(visibleHeight).toBeGreaterThanOrEqual(Math.min(60, item!.height * 0.7));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
