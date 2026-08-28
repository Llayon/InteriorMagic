import { expect, test } from '@playwright/test';
import path from 'node:path';

const seed = ['showcase-rug', 'showcase-sofa', 'showcase-chair-left', 'showcase-chair-right', 'showcase-table', 'showcase-console', 'showcase-lamp', 'showcase-tv'];
const visual = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join('.agent-data', 'm1a-visual', `${page.viewportSize()?.width}x${page.viewportSize()?.height}`, `${name}.png`), fullPage: true });
const openShowcase = async (page: import('@playwright/test').Page) => {
  await page.goto('/?showcase=1');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady()), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets)).toBe(7);
};

test('M1A local showcase is real, reduced, and restores through undo', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/__m1a_assets__/')) requests.push(request.url()); });
  await openShowcase(page);
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sheet-state', /peek|expanded/);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets)).toBe(7);
  const snapshot = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await visual(page, 'initial-room');
  expect(snapshot.room).toEqual({ width: 6.2, depth: 5.8, height: 2.7 });
  expect(snapshot.objects.map((object) => object.instanceId)).toEqual(seed);
  const modelRequests = requests.filter((url) => url.includes('/models/'));
  expect(new Set(modelRequests).size).toBe(7);
  expect(new Set(modelRequests).size).toBe(modelRequests.length);

  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.moveObjectForTest('showcase-chair-left', { x: -1.7, y: 0, z: -1.4 }));
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')?.position.x)).toBe(-1.7);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')?.position.x)).toBe(-1.654823091533035);
  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.selectObjectForTest('showcase-chair-left'));
  const beforeRotate = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')!.rotationY);
  await page.getByTestId('toolbar-rotate-right').click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')!.rotationY)).not.toBe(beforeRotate);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('showcase-chair-left')!.rotationY)).toBe(beforeRotate);
});

test('M1A normal catalog path adds a reduced-catalog item and restores by undo', async ({ page }) => {
  await openShowcase(page);
  const before = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await visual(page, 'catalog');
  await page.getByRole('button', { name: 'Add chair' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects.length)).toBe(9);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).objects.at(-1)?.assetId).toBe('chair');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(before);
});

test('M1A real TV analysis previews, applies, and exactly undoes', async ({ page }) => {
  await openShowcase(page);
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await page.getByTestId('planner-entry').click();
  await expect(page.getByTestId('planner-panel')).toBeVisible();
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'ready', { timeout: 15_000 });
  const proposal = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().proposal);
  expect(proposal?.moves.length).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().outcome))).not.toBe('noValidPlan');
  await page.getByTestId('planner-preview-button').click();
  await visual(page, 'tv-preview');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  await page.getByTestId('planner-apply').click();
  await visual(page, 'tv-applied');
  const applied = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(applied).not.toEqual(original);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
});

test('M1A real Conversation analysis previews, applies, and exactly undoes', async ({ page }) => {
  await page.route('https://intent.test/planning-intent', async (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, contractVersion: 2, output: { activity: 'conversation' } }) }));
  await openShowcase(page);
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await page.getByTestId('planner-entry').click();
  await expect(page.getByTestId('planner-panel')).toBeVisible();
  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.beginPlanningIntentAnalysis('Сделай удобнее для общения'));
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'ready', { timeout: 15_000 });
  const proposal = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().proposal);
  expect(proposal?.moves.length).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().outcome))).not.toBe('noValidPlan');
  await page.getByTestId('planner-preview-button').click();
  await visual(page, 'conversation-preview');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  await page.getByTestId('planner-apply').click();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).not.toEqual(original);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
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
