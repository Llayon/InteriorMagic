import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { addAsset, openApp } from './helpers';

async function inside(page: Page, locator: Locator, name: string) {
  await expect(locator, `${name} visible`).toBeVisible();
  const box = await locator.boundingBox(), viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  return box!;
}

test('keeps the workspace and critical controls usable', async ({ monitoredPage: page }, testInfo) => {
  await openApp(page);
  const canvas = await inside(page, page.locator('canvas'), 'canvas');
  await inside(page, page.getByTestId('app-header'), 'header');
  await inside(page, page.getByTestId('workspace-sheet'), 'sheet');
  expect(canvas.height).toBeGreaterThan(page.viewportSize()!.height * .75);
  if (testInfo.project.name === 'mobile-short') await expect(page.locator('.hint')).toBeHidden();
  await addAsset(page, 'chairs', 'chair');
  const toolbar = await inside(page, page.getByTestId('object-toolbar'), 'object toolbar');
  const sheet = await page.getByTestId('workspace-sheet').boundingBox();
  if (testInfo.project.name !== 'desktop') expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(sheet!.y + 1);
  for (const name of ['Rotate right', 'Delete', 'Project menu', 'Materials', 'Category chairs']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box!.width, name).toBeGreaterThanOrEqual(40); expect(box!.height, name).toBeGreaterThanOrEqual(40);
  }
  await page.getByRole('button', { name: 'Materials' }).click();
  await inside(page, page.getByTestId('materials-panel'), 'materials');
  await expect(page.locator('.materials-panel .swatches button')).toHaveCount(6);
  await page.getByRole('button', { name: 'Project menu' }).click();
  await inside(page, page.locator('.project-pop'), 'project menu');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
