import { expect, test } from '@playwright/test';

const previewEnabled = process.env.ITHAPPY_PREVIEW_ENABLED !== 'false';
const remoteOrigin = (process.env.ITHAPPY_TEST_ASSET_ORIGIN || 'http://127.0.0.1:4174/catalog/v1/').replace(/\/+$/, '');
const placementMetadataUrl = process.env.ITHAPPY_TEST_PREVIEW_PLACEMENT_URL || 'http://127.0.0.1:4173/.local-assets/ithappy-registry/prototype-placement.json';
const appPath = process.env.ITHAPPY_TEST_APP_PATH || '/';
const productionArtifact = process.env.ITHAPPY_PRODUCTION_ARTIFACT === 'true';
const appUrl = (search: string) => `${appPath}${search}`;
const isRemotePreviewRequest = (url: string) => url.startsWith(remoteOrigin) || url === placementMetadataUrl;

test('remote query is ignored when the build preview flag is disabled', async ({ page }) => {
  test.skip(previewEnabled, 'disabled-build assertion');
  const remoteRequests: string[] = [];
  page.on('request', (request) => { if (isRemotePreviewRequest(request.url())) remoteRequests.push(request.url()); });
  await page.route('https://telegram.org/js/telegram-web-app.js**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(appUrl('?registry=ithappy-remote&debug=1'));
  await expect(page.getByTestId('app-root')).toBeVisible();
  if (!productionArtifact) {
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
    expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getCatalogStats()?.totalEntries)) ?? 0).not.toBe(836);
  }
  expect(remoteRequests).toHaveLength(0);
});

test('normal URL remains on the public catalog in a preview-capable build', async ({ page }) => {
  test.skip(!previewEnabled, 'enabled-build assertion');
  const remoteRequests: string[] = [];
  page.on('request', (request) => { if (isRemotePreviewRequest(request.url())) remoteRequests.push(request.url()); });
  await page.route('https://telegram.org/js/telegram-web-app.js**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(appUrl('?debug=1'));
  await expect(page.getByTestId('app-root')).toBeVisible();
  if (!productionArtifact) {
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
    expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getCatalogStats()?.totalEntries)) ?? 0).not.toBe(836);
  }
  expect(remoteRequests).toHaveLength(0);
});

test('remote origin preserves catalog lazy loading and AssetCache reuse', async ({ page }) => {
  test.skip(!previewEnabled, 'enabled-build assertion');
  await page.route('https://telegram.org/js/telegram-web-app.js**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  page.on('pageerror', (error) => console.error(`PAGE ERROR: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') console.error(`CONSOLE ERROR: ${message.text()}`); });
  page.on('requestfailed', (request) => console.error(`REQUEST FAILED: ${request.url()} ${request.failure()?.errorText}`));
  const glbs: string[] = [];
  const thumbnails = new Set<string>();
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(`${remoteOrigin}/runtime/`) && url.endsWith('.glb')) glbs.push(url);
    if (url.startsWith(`${remoteOrigin}/thumbnails/`) && url.endsWith('.webp')) thumbnails.add(url);
  });
  const placementRequests: string[] = [];
  page.on('request', (request) => { if (request.url() === placementMetadataUrl) placementRequests.push(request.url()); });

  await page.goto(appUrl('?registry=ithappy-remote&debug=1'));
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 30_000 });
  if (!productionArtifact) {
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
    expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getCatalogStats())).toMatchObject({ totalEntries: 836, visibleEntries: 836 });
  }
  expect(placementRequests).toHaveLength(1);
  expect(glbs).toHaveLength(0);

  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.locator('.item')).toHaveCount(86);
  await expect(page.locator('.item img').first()).toBeVisible();
  expect(glbs).toHaveLength(0);
  await page.getByRole('button', { name: 'Category decor' }).click();
  await expect(page.locator('.item')).toHaveCount(231);
  await page.locator('.items').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('.item img').last()).toBeVisible();
  expect(glbs).toHaveLength(0);
  await page.getByRole('button', { name: 'Category architecture' }).click();
  await expect(page.locator('.item')).toHaveCount(186);
  await expect(page.locator('.item').first()).toBeDisabled();
  expect(glbs).toHaveLength(0);

  await page.getByRole('button', { name: 'Category seating' }).click();
  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  if (!productionArtifact) await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.filter((item) => item.assetId === 'sofa_037').length)).toBe(1);
  await expect.poll(() => glbs.filter((url) => url.endsWith('/sofa_037.glb')).length).toBe(1);
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await page.getByRole('button', { name: 'Add sofa_037' }).click();
  if (!productionArtifact) await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.filter((item) => item.assetId === 'sofa_037').length)).toBe(2);
  expect(glbs.filter((url) => url.endsWith('/sofa_037.glb'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await page.getByRole('button', { name: 'Add chair_024' }).click();
  await expect.poll(() => new Set(glbs).size).toBe(2);
  if (!productionArtifact) await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats().loadedAssets)).toBe(2);

  if (!productionArtifact) {
    const result = await page.evaluate(() => ({ project: window.__INTERIOR_MAGIC_TEST__!.getProject(), cache: window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats() }));
    expect(result.cache.loadedAssets).toBe(2);
    expect(result.project.objects.every((item) => !item.assetId.includes('/') && !item.assetId.includes('://'))).toBe(true);
  }
  expect(thumbnails.size).toBeGreaterThan(0);
  expect(thumbnails.size).toBeLessThan(836);
});
