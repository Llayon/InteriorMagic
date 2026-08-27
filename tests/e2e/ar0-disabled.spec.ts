import { expect, test } from './fixtures';
import { openApp } from './helpers';

test('AR0 is default-off while the ordinary editor still boots', async ({ monitoredPage: page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Category chairs' }).click();
  await expect(page.locator('[data-ar-asset-id]')).toHaveCount(0);
});

test('a direct AR0 URL fails closed without instantiating model-viewer', async ({ monitoredPage: page }) => {
  await page.goto('/?ar=sheen-chair-r1');
  await expect(page.getByTestId('ar0-disabled')).toBeVisible();
  await expect(page.getByTestId('ar0-model-viewer')).toHaveCount(0);
  await expect(page.getByTestId('app-root')).toHaveCount(0);
  expect(await page.evaluate(() => customElements.get('model-viewer'))).toBeUndefined();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__)).toBeUndefined();
});
