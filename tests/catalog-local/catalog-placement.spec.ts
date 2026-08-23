import { expect, test, type Page } from '@playwright/test';

const openCatalog = async (page: Page) => {
  await page.goto('/?registry=ithappy&debug=1');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady() ?? false)).toBe(true);
  await page.getByRole('button', { name: 'Expand panel' }).click();
};

test('representative enabled categories use the existing add flow', async ({ page }) => {
  test.setTimeout(180_000);
  const cases = [
    ['seating', 'sofa_037'], ['seating', 'chair_024'], ['tables', 'coffee_table'], ['storage', 'cupboard_003'],
    ['lighting', 'lamp_048'], ['plants', 'flower_039'], ['decor', 'carpet_017'],
  ] as const;
  for (const [category, assetId] of cases) await test.step(`${category}: ${assetId}`, async () => {
    await openCatalog(page);
    await page.locator(`[data-category-id="${category}"]`).click();
    await page.locator(`[data-asset-id="${assetId}"]`).click();
    await expect.poll(() => page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.some((object) => object.assetId === id), assetId)).toBe(true);
    const persisted = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.find((object) => object.assetId === id), assetId);
    expect(persisted?.assetId).toBe(assetId);
    expect(JSON.stringify(persisted)).not.toContain('runtime-assets');
    await expect(page.getByTestId('workspace-sheet')).toHaveAttribute('data-sheet-state', 'peek');
  });
});

test('browse-only categories cannot mutate RoomProject', async ({ page }) => {
  await openCatalog(page);
  for (const category of ['bedroom', 'kitchen-bath', 'architecture']) await test.step(category, async () => {
    await page.locator(`[data-category-id="${category}"]`).click();
    const count = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.length);
    const card = page.locator('.item').first();
    await expect(card).toBeDisabled();
    await card.evaluate((element) => (element as HTMLButtonElement).click());
    expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.length)).toBe(count);
  });
});
