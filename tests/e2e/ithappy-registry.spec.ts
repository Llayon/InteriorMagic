import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const ids = ['sofa_037', 'chair_024', 'lamp_048'] as const;

test('resolves the local runtime manifest lazily through AssetCache', async ({ page }) => {
  const glbRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/.local-assets/ithappy-registry/runtime-assets/') && request.url().endsWith('.glb')) glbRequests.push(request.url());
  });

  await page.goto('/?registry=ithappy&debug=1');
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
  expect(glbRequests).toHaveLength(0);
  const requestCounts = { startup: glbRequests.length, afterSofa: -1, afterChair: -1, afterLamp: -1 };
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets)).toBe(0);

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/.local-assets/ithappy-registry/runtime-catalog.json');
    return response.json() as Promise<Array<{ id: string; runtimeFilename: string }>>;
  });
  expect(manifest).toHaveLength(836);
  expect(ids.every((id) => manifest.some((entry) => entry.id === id))).toBe(true);
  expect(JSON.stringify(manifest)).not.toMatch(/[A-Za-z]:\\/);

  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getProject().objects.filter((object) => object.assetId === 'sofa_037').length ?? 0)).toBe(1);
  await expect.poll(() => glbRequests.filter((url) => url.endsWith('/sofa_037.glb')).length).toBe(1);
  requestCounts.afterSofa = glbRequests.length;

  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getProject().objects.filter((object) => object.assetId === 'sofa_037').length ?? 0)).toBe(2);
  expect(glbRequests.filter((url) => url.endsWith('/sofa_037.glb'))).toHaveLength(1);

  await page.getByRole('button', { name: 'Category chairs' }).click();
  await page.getByRole('button', { name: 'Add chair_024' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getProject().objects.some((object) => object.assetId === 'chair_024') ?? false)).toBe(true);
  await expect.poll(() => glbRequests.filter((url) => url.endsWith('/chair_024.glb')).length).toBe(1);
  requestCounts.afterChair = glbRequests.length;

  await page.getByRole('button', { name: 'Category lamps' }).click();
  await page.getByRole('button', { name: 'Add lamp_048' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getProject().objects.some((object) => object.assetId === 'lamp_048') ?? false)).toBe(true);
  await expect.poll(() => glbRequests.filter((url) => url.endsWith('/lamp_048.glb')).length).toBe(1);
  requestCounts.afterLamp = glbRequests.length;

  const result = await expect.poll(async () => page.evaluate(() => {
    const project = window.__INTERIOR_MAGIC_TEST__?.getProject();
    const renderer = window.__INTERIOR_MAGIC_TEST__?.getRendererStats();
    const cache = window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats();
    return project && renderer && cache && cache.loadedAssets === 3 && renderer.calls > 0 ? { project, renderer, cache } : null;
  })).not.toBeNull().then(() => page.evaluate(() => {
    const project = window.__INTERIOR_MAGIC_TEST__!.getProject();
    return { project, renderer: window.__INTERIOR_MAGIC_TEST__!.getRendererStats(), cache: window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats() };
  }));

  expect(result.project.objects.map((object) => object.assetId)).toEqual(['sofa_037', 'sofa_037', 'chair_024', 'lamp_048']);
  expect(result.project.objects.every((object) => !object.assetId.includes('/') && !object.assetId.includes('\\'))).toBe(true);
  expect(result.renderer).toMatchObject({ frameloop: 'demand', ready: true });
  expect(result.renderer.dpr).toBeGreaterThan(0);
  expect(result.renderer.dpr).toBeLessThanOrEqual(1.5);
  expect(result.cache).toMatchObject({ loadedAssets: 3, byteSize: 387756 });
  expect(glbRequests).toHaveLength(3);
  await mkdir('visual-evidence', { recursive: true });
  await writeFile('visual-evidence/ithappy-registry-prototype.json', JSON.stringify({ manifestEntries: manifest.length, requestCounts, renderer: result.renderer, cache: result.cache }, null, 2));
  await page.screenshot({ path: 'visual-evidence/ithappy-registry-prototype.png' });
});
