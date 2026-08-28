import { expect, test } from '@playwright/test';

test('M1A local showcase is real, reduced, and restores through undo', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/__m1a_assets__/')) requests.push(request.url()); });
  await page.goto('/?showcase=1');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sheet-state', /peek|expanded/);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets)).toBe(7);
  const snapshot = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(snapshot.room).toEqual({ width: 6.2, depth: 5.8, height: 2.7 });
  expect(snapshot.objects.map((object) => object.instanceId)).toEqual(['showcase-rug', 'showcase-sofa', 'showcase-chair-left', 'showcase-chair-right', 'showcase-table', 'showcase-console', 'showcase-lamp', 'showcase-tv']);
  const modelRequests = requests.filter((url) => url.includes('/models/'));
  expect(new Set(modelRequests).size).toBe(7);
  expect(new Set(modelRequests).size).toBe(modelRequests.length);

  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.moveObjectForTest('showcase-chair-left', { x: -1.5, y: 0, z: 0.65 }));
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')?.position.x)).toBe(-1.5);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')?.position.x)).toBe(-2);
});

test('M1A private routes are allowlisted and have deterministic HEAD responses', async ({ request }) => {
  for (const id of ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030']) {
    const model = await request.head(`/__m1a_assets__/models/${id}.glb`);
    expect(model.status()).toBe(200);
    expect(model.headers()['content-type']).toContain('model/gltf-binary');
    const thumb = await request.head(`/__m1a_assets__/thumbs/${id}.png`);
    expect(thumb.status()).toBe(200);
    expect(thumb.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('/__m1a_assets__/models/../facts.json')).status()).toBe(404);
  expect((await request.get('/__m1a_assets__/models/not-selected.glb')).status()).toBe(404);
});
