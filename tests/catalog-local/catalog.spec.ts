import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('browses thumbnails lazily and adds through the existing editor path', async ({ page }, testInfo) => {
  const glbRequests: string[] = [], thumbnailRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/.local-assets/ithappy-registry/runtime-assets/') && url.endsWith('.glb')) glbRequests.push(url);
    if (url.includes('/.local-assets/ithappy-registry/thumbnails/') && url.endsWith('.webp')) thumbnailRequests.push(url);
  });

  await page.goto('/?registry=ithappy&debug=1');
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
  const stats = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getCatalogStats() ?? null);
  expect(stats).toEqual({ totalEntries: 836, visibleEntries: 24, categories: { seating: 86, tables: 38, storage: 107, bedroom: 23, lighting: 19, plants: 19, decor: 231, 'kitchen-bath': 127, architecture: 186 }, visibleIds: expect.any(Array) });
  expect(glbRequests).toHaveLength(0);

  const isDesktop = testInfo.project.name === 'desktop';
  if (!isDesktop) await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.getByRole('button', { name: 'Category seating' })).toBeVisible();
  await expect(page.locator('.item img').first()).toBeVisible();
  await expect.poll(() => page.locator('.item img').first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(256);
  await page.screenshot({ path: `visual-evidence/ithappy-catalog-${testInfo.project.name}-open.png` });
  expect(glbRequests).toHaveLength(0);

  await page.locator('.items').evaluate((element) => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
  expect(glbRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Category storage' }).click();
  await expect(page.getByRole('button', { name: 'Add cupboard_003' })).toBeVisible();
  await page.screenshot({ path: `visual-evidence/ithappy-catalog-${testInfo.project.name}-storage.png` });
  expect(glbRequests).toHaveLength(0);

  await page.getByRole('button', { name: 'Category seating' }).click();
  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getProject().objects.filter((object) => object.assetId === 'sofa_037').length ?? 0)).toBe(1);
  await expect.poll(() => glbRequests.filter((url) => url.endsWith('/sofa_037.glb')).length).toBe(1);
  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getProject().objects.filter((object) => object.assetId === 'sofa_037').length ?? 0)).toBe(2);
  expect(glbRequests.filter((url) => url.endsWith('/sofa_037.glb'))).toHaveLength(1);
  await page.screenshot({ path: `visual-evidence/ithappy-catalog-${testInfo.project.name}-added.png` });

  const result = await expect.poll(async () => page.evaluate(() => {
    const renderer = window.__INTERIOR_MAGIC_TEST__?.getRendererStats(), cache = window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats();
    return renderer && cache && renderer.calls > 0 && cache.loadedAssets === 1 ? { renderer, cache } : null;
  })).not.toBeNull().then(() => page.evaluate(() => ({ renderer: window.__INTERIOR_MAGIC_TEST__!.getRendererStats(), cache: window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats(), project: window.__INTERIOR_MAGIC_TEST__!.getProject() })));
  expect(result.renderer).toMatchObject({ frameloop: 'demand', ready: true });
  expect(result.renderer.dpr).toBeLessThanOrEqual(1.5);
  expect(result.cache).toMatchObject({ loadedAssets: 1, byteSize: 196336 });
  expect(result.project.objects.every((object) => object.assetId === 'sofa_037' && !object.assetId.includes('/'))).toBe(true);
  expect(glbRequests).toHaveLength(1);
  expect(thumbnailRequests.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sheet = await page.getByTestId('workspace-sheet').boundingBox();
  expect(sheet && sheet.x >= 0 && sheet.x + sheet.width <= testInfo.project.use.viewport!.width + 1).toBe(true);

  await mkdir('visual-evidence', { recursive: true });
  await writeFile(`visual-evidence/ithappy-catalog-${testInfo.project.name}-metrics.json`, JSON.stringify({ glbRequests: glbRequests.length, thumbnailRequests: thumbnailRequests.length, renderer: result.renderer, cache: result.cache }, null, 2));
});
