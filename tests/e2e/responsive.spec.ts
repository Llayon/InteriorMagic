import { test, expect } from './fixtures';
import { openApp } from './helpers';

test('keeps essential UI inside the viewport without horizontal scrolling', async ({ monitoredPage: page }) => {
  await openApp(page);
  for (const [name, locator] of Object.entries({ header: page.getByTestId('app-header'), catalog: page.getByTestId('catalog'), scene: page.getByTestId('scene'), undo: page.getByRole('button', { name: 'Undo' }), canvas: page.locator('canvas') })) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box!.width).toBeGreaterThan(0); expect(box!.height).toBeGreaterThan(0);
    expect(box!.x, `${name} left edge`).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width, `${name} right edge`).toBeLessThanOrEqual((await page.viewportSize())!.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
