import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { openApp, project, proxyBounds } from './helpers';

const capture = process.env.CAPTURE_VISUALS === '1';
const evidencePath = (name: string) => path.join(process.cwd(), 'visual-evidence', name);

test('loads a trial thumbnail and production GLB through the catalog', async ({ monitoredPage: page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Category sofas' }).click();
  const item = page.locator('[data-asset-id="nordicSofa"]');
  await expect(item.locator('img')).toBeVisible();
  await item.click();
  await expect.poll(async () => (await project(page)).objects.some((object) => object.assetId === 'nordicSofa')).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats().assets.find((asset) => asset.assetId === 'nordicSofa')?.status)).toBe('ready');
});

test('renders the curated living room within the mobile budget', async ({ monitoredPage: page }, testInfo) => {
  await page.goto('/?demo=1');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady()), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats().loadedAssets), { timeout: 15_000 }).toBe(9);
  expect((await project(page)).objects).toHaveLength(9);
  const renderer = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRendererStats());
  const cache = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats());
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const glbs = performance.getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('.glb'))
      .map((entry) => ({ name: new URL(entry.name).pathname.split('/').at(-1), durationMs: Math.round(entry.duration * 10) / 10 }));
    return { domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd * 10) / 10 : null, glbs };
  });
  expect(renderer.frameloop).toBe('demand'); expect(renderer.calls).toBeLessThan(60); expect(renderer.triangles).toBeLessThan(100_000); expect(cache.byteSize).toBeLessThan(200_000);
  await testInfo.attach('rendering-metrics.json', { body: JSON.stringify({ project: testInfo.project.name, renderer, cache, timing }, null, 2), contentType: 'application/json' });
  if (capture) {
    await mkdir(evidencePath('.'), { recursive: true });
    await writeFile(evidencePath(`${testInfo.project.name}-metrics.json`), JSON.stringify({ project: testInfo.project.name, renderer, cache, timing }, null, 2));
    await page.screenshot({ path: evidencePath(`${testInfo.project.name}-furnished.png`) });
    if (testInfo.project.name === 'mobile-small') {
      const bounds = await proxyBounds(page, 'demo-sofa');
      await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSelectedInstanceId())).toBe('demo-sofa');
      await page.screenshot({ path: evidencePath('mobile-small-selected.png') });
    }
  }
});

test('captures the calibrated empty room baseline', async ({ monitoredPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-small', 'one empty baseline is sufficient');
  await openApp(page);
  if (capture) await page.screenshot({ path: evidencePath('mobile-small-empty.png') });
});
