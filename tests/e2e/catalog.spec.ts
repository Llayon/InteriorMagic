import { test, expect } from './fixtures';
import { addAsset, openApp, project } from './helpers';

test('loads the external Sheen Chair through catalog and AssetCache', async ({ monitoredPage: page }) => {
  const responses: number[] = [];
  page.on('response', (response) => { if (response.url().endsWith('/models/sheen_chair.glb')) responses.push(response.status()); });
  await openApp(page);
  await page.getByRole('button', { name: 'Category chairs' }).click();
  await expect(page.locator('[data-asset-id="sheenChair"] img')).toBeVisible();
  const chair = await addAsset(page, 'chairs', 'sheenChair');
  expect(chair.assetId).toBe('sheenChair');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats().assets.find((asset) => asset.assetId === 'sheenChair')?.status)).toBe('ready');
  expect(responses).toContain(200);
});

test('latest catalog request wins deterministically', async ({ monitoredPage: page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/models/sheen_chair.glb', async (route) => { await held; await route.continue(); });
  await openApp(page);
  await page.getByRole('button', { name: 'Category chairs' }).click();
  await page.locator('[data-asset-id="sheenChair"]').click();
  await expect(page.locator('[data-asset-id="sheenChair"]')).toHaveAttribute('aria-busy', 'true');
  await page.locator('[data-asset-id="chair"]').click();
  await expect.poll(async () => (await project(page)).objects.map((object) => object.assetId)).toEqual(['chair']);
  release();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats().assets.find((asset) => asset.assetId === 'sheenChair')?.status)).toBe('ready');
  expect((await project(page)).objects.map((object) => object.assetId)).toEqual(['chair']);
});
