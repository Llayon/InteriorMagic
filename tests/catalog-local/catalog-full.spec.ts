import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const expectedCategories = { seating: 86, tables: 38, storage: 107, bedroom: 23, lighting: 19, plants: 19, decor: 231, 'kitchen-bath': 127, architecture: 186 };

test('browses the complete catalog lazily and reuses AssetCache', async ({ page }) => {
  const glbRequests: string[] = [];
  const thumbnailRequests = new Set<string>();
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/.local-assets/ithappy-registry/runtime-assets/') && url.endsWith('.glb')) glbRequests.push(url);
    if (url.includes('/.local-assets/ithappy-registry/thumbnails/') && url.endsWith('.webp')) thumbnailRequests.add(url);
  });
  await mkdir('visual-evidence', { recursive: true });
  await page.goto('/?registry=ithappy&debug=1');
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
  const stats = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getCatalogStats() ?? null);
  expect(stats).toMatchObject({ totalEntries: 836, visibleEntries: 836, categories: expectedCategories });
  expect(stats?.placementEnabledCategories.sort()).toEqual(['decor', 'lighting', 'plants', 'seating', 'storage', 'tables']);
  expect(glbRequests).toHaveLength(0);
  const thumbnailCounts: Record<string, number> = { startup: thumbnailRequests.size };

  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.getByTestId('workspace-sheet')).toHaveAttribute('data-sheet-state', 'expanded');
  await expect(page.locator('.item')).toHaveCount(86);
  await expect(page.locator('.item img').first()).toBeVisible();
  await expect.poll(() => page.locator('.item img').first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(256);
  thumbnailCounts.catalogOpen = thumbnailRequests.size;
  expect(glbRequests).toHaveLength(0);
  await page.screenshot({ path: 'visual-evidence/ithappy-full-mobile-small-seating.png' });

  const decorStarted = performance.now();
  await page.getByRole('button', { name: 'Category decor' }).click();
  await expect(page.locator('.item')).toHaveCount(231);
  const decorSwitchMs = performance.now() - decorStarted;
  thumbnailCounts.decorInitial = thumbnailRequests.size;
  expect(glbRequests).toHaveLength(0);
  await page.screenshot({ path: 'visual-evidence/ithappy-full-mobile-small-decor.png' });
  await page.locator('.items').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('.item img').last()).toBeVisible();
  await expect.poll(() => page.locator('.item img').last().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(256);
  thumbnailCounts.decorScrolled = thumbnailRequests.size;
  expect(glbRequests).toHaveLength(0);
  await page.screenshot({ path: 'visual-evidence/ithappy-full-mobile-small-decor-scrolled.png' });

  const kitchenBathStarted = performance.now();
  await page.getByRole('button', { name: 'Category kitchen-bath' }).click();
  await expect(page.locator('.item')).toHaveCount(127);
  const kitchenBathSwitchMs = performance.now() - kitchenBathStarted;
  await expect(page.locator('.item').first()).toBeDisabled();
  thumbnailCounts.kitchenBath = thumbnailRequests.size;
  expect(glbRequests).toHaveLength(0);

  const architectureStarted = performance.now();
  await page.getByRole('button', { name: 'Category architecture' }).click();
  await expect(page.locator('.item')).toHaveCount(186);
  await expect.poll(() => page.locator('.items').evaluate((element) => element.scrollTop)).toBe(0);
  const architectureSwitchMs = performance.now() - architectureStarted;
  const blockedCard = page.locator('.item').first();
  await expect(blockedCard).toBeDisabled();
  await expect(blockedCard).toHaveAttribute('aria-disabled', 'true');
  const beforeBlocked = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.length);
  await blockedCard.evaluate((element) => (element as HTMLButtonElement).click());
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.length)).toBe(beforeBlocked);
  thumbnailCounts.architecture = thumbnailRequests.size;
  expect(glbRequests).toHaveLength(0);
  await page.screenshot({ path: 'visual-evidence/ithappy-full-mobile-small-architecture-disabled.png' });

  await page.getByRole('button', { name: 'Category seating' }).click();
  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.filter((object) => object.assetId === 'sofa_037').length)).toBe(1);
  await expect.poll(() => glbRequests.filter((url) => url.endsWith('/sofa_037.glb')).length).toBe(1);
  await expect(page.getByTestId('workspace-sheet')).toHaveAttribute('data-sheet-state', 'peek');
  await page.screenshot({ path: 'visual-evidence/ithappy-full-mobile-small-sofa-added.png' });

  await page.getByRole('button', { name: 'Expand panel' }).click();
  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.filter((object) => object.assetId === 'sofa_037').length)).toBe(2);
  expect(glbRequests.filter((url) => url.endsWith('/sofa_037.glb'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await page.getByRole('button', { name: 'Add chair_024' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.filter((object) => object.assetId === 'chair_024').length)).toBe(1);
  await expect.poll(() => new Set(glbRequests).size).toBe(2);

  const result = await expect.poll(async () => page.evaluate(() => {
    const renderer = window.__INTERIOR_MAGIC_TEST__?.getRendererStats(), cache = window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats();
    return renderer && cache && renderer.calls > 0 && cache.loadedAssets === 2 ? { renderer, cache } : null;
  })).not.toBeNull().then(() => page.evaluate(() => ({ renderer: window.__INTERIOR_MAGIC_TEST__!.getRendererStats(), cache: window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats(), project: window.__INTERIOR_MAGIC_TEST__!.getProject() })));
  expect(result.renderer).toMatchObject({ frameloop: 'demand', ready: true });
  expect(result.renderer.dpr).toBeLessThanOrEqual(1.5);
  expect(result.project.objects.every((object) => !object.assetId.includes('/') && !object.assetId.includes('://'))).toBe(true);
  expect(thumbnailRequests.size).toBeLessThan(836);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await writeFile('visual-evidence/ithappy-full-mobile-small-metrics.json', JSON.stringify({ glbRequests, uniqueGlbRequests: new Set(glbRequests).size, thumbnailCounts, totalUniqueThumbnailRequests: thumbnailRequests.size, decorSwitchMs, kitchenBathSwitchMs, architectureSwitchMs, renderer: result.renderer, cache: result.cache }, null, 2));
});
