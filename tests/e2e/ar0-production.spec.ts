import { expect, test } from '@playwright/test';

test('production AR0 uses the verified public r1 delivery', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/?ar=sheen-chair-r1');
  await expect(page.getByTestId('ar0-landing')).toBeVisible({ timeout: 20_000 });
  const viewer = page.getByTestId('ar0-model-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('ar-scale', 'fixed');
  await expect(viewer).toHaveAttribute('ar-placement', 'floor');
  await expect(viewer).toHaveAttribute('ar-modes', 'scene-viewer quick-look');
  await expect(viewer).toHaveAttribute('ios-src', /https:\/\/[^/]+\/ar0\/sheen-chair\/r1\/model\.usdz$/u);
  expect(await viewer.evaluate((element) => (element as HTMLElement & { src?: string }).src ?? element.getAttribute('src') ?? '')).toMatch(/https:\/\/[^/]+\/ar0\/sheen-chair\/r1\/model\.glb$/u);
  expect(requests.some((url) => url.includes('/ar0/sheen-chair/r1/model.glb'))).toBe(true);
  expect(requests.some((url) => url.includes('/ar0/sheen-chair/r1/model.usdz'))).toBe(false);
  expect(requests.some((url) => url.includes('/artifacts/ar0/'))).toBe(false);
});
