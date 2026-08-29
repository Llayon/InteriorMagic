import { test, expect } from './fixtures';
import { openApp, project } from './helpers';

test('catalog exposes AR only for Sheen Chair without adding furniture', async ({ monitoredPage: page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Category chairs' }).click();
  await expect(page.locator('[data-ar-asset-id="sheenChair"]')).toBeVisible();
  await expect(page.locator('[data-ar-asset-id="chair"]')).toHaveCount(0);
  const before = (await project(page)).objects.length;
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-ar-asset-id="sheenChair"]').click();
  const landing = await popupPromise;
  await landing.waitForLoadState('domcontentloaded');
  expect(new URL(landing.url()).searchParams.get('ar')).toBe('sheen-chair-r2');
  expect((await project(page)).objects.length).toBe(before);
  await landing.close();
});

test('AR landing uses prebuilt fixed-scale native AR files and keeps web 3D fallback', async ({ monitoredPage: page }) => {
  const responses: Record<string, number> = {};
  page.on('response', (response) => {
    if (/\/(?:manifest\.json|model\.glb|model\.usdz)$/u.test(new URL(response.url()).pathname)) responses[new URL(response.url()).pathname.split('/').at(-1)!] = response.status();
  });
  await page.goto('/?ar=sheen-chair-r2');
  await expect(page.getByTestId('ar0-landing')).toBeVisible();
  await expect(page.getByTestId('app-root')).toHaveCount(0);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__)).toBeUndefined();
  const viewer = page.getByTestId('ar0-model-viewer');
  await expect(viewer).toBeVisible();
  expect(await viewer.evaluate((element) => (element as HTMLElement & { src?: string }).src ?? element.getAttribute('src') ?? '')).toMatch(/\/ar0\/sheen-chair\/r2\/model\.glb$/u);
  await expect(viewer).toHaveAttribute('ios-src', /\/ar0\/sheen-chair\/r2\/model\.usdz$/u);
  await expect.poll(() => viewer.evaluate((element) => Boolean((element as HTMLElement & { ar?: boolean }).ar))).toBe(true);
  await expect(viewer).toHaveAttribute('ar-scale', 'fixed');
  await expect(viewer).toHaveAttribute('ar-placement', 'floor');
  await expect(viewer).toHaveAttribute('ar-modes', 'scene-viewer quick-look');
  expect((await viewer.getAttribute('ar-modes'))?.includes('webxr')).toBe(false);
  await expect(page.getByText('Ширина:').locator('strong')).toHaveText('82.7 см');
  await expect(page.getByText('Высота:').locator('strong')).toHaveText('68.6 см');
  await expect(page.getByText('Глубина:').locator('strong')).toHaveText('57.0 см');
  expect(responses['manifest.json']).toBe(200);
  expect(responses['model.glb']).toBe(200);
  await expect(page.getByTestId('ar0-web-fallback')).toBeVisible();

  const glbResponse = await page.request.get('/ar0/sheen-chair/r2/model.glb');
  const usdzResponse = await page.request.get('/ar0/sheen-chair/r2/model.usdz');
  expect(glbResponse.headers()['content-type']).toContain('model/gltf-binary');
  expect(usdzResponse.headers()['content-type']).toContain('model/vnd.usdz+zip');
});

test('unknown AR revision fails safely without editor bootstrap', async ({ monitoredPage: page }) => {
  await page.goto('/?ar=unknown-revision');
  await expect(page.getByTestId('ar0-unknown-revision')).toBeVisible();
  await expect(page.getByTestId('app-root')).toHaveCount(0);
});

test('AR landing renders physical facts from the validated manifest', async ({ monitoredPage: page }) => {
  await page.route('**/ar0/sheen-chair/r2/manifest.json', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    await route.fulfill({ response, json: {
      ...manifest,
      spatial: { ...manifest.spatial, dimensionsMeters: { width: 1, height: 2, depth: 3 } },
    } });
  });
  await page.goto('/?ar=sheen-chair-r2');
  await expect(page.getByTestId('ar0-model-viewer')).toBeVisible();
  await expect(page.getByText('Ширина:').locator('strong')).toHaveText('100.0 см');
  await expect(page.getByText('Высота:').locator('strong')).toHaveText('200.0 см');
  await expect(page.getByText('Глубина:').locator('strong')).toHaveText('300.0 см');
});

test('invalid manifest fails closed before creating a model-viewer', async ({ monitoredPage: page }) => {
  await page.route('**/ar0/sheen-chair/r2/manifest.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1 }) });
  });
  await page.goto('/?ar=sheen-chair-r2');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('ar0-model-viewer')).toHaveCount(0);
});
