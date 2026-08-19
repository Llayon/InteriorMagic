import { test, expect } from './fixtures';
import { addAsset, openApp, project, TouchGesture } from './helpers';

test('sheet toggles without mutating project and auto-collapses after add', async ({ monitoredPage: page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'desktop uses a persistent sidebar');
  await openApp(page);
  const sheet = page.getByTestId('workspace-sheet');
  const before = await project(page);
  await expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(sheet).toHaveAttribute('data-sheet-state', 'expanded');
  expect(await project(page)).toEqual(before);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await addAsset(page, 'chairs', 'chair');
  await expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
});

test('materials are project data while workspace state remains session-only', async ({ monitoredPage: page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Materials' }).click();
  await expect(page.getByTestId('workspace-sheet')).toHaveAttribute('data-workspace-panel', 'materials');
  await page.getByRole('button', { name: 'floor finish walnut' }).click();
  await page.getByRole('button', { name: 'wall finish mist' }).click();
  const value = await project(page);
  expect(value.finishes).toEqual({ floorMaterialId: 'walnut', wallMaterialId: 'mist' });
  expect(Object.keys(value).sort()).toEqual(['finishes', 'objects', 'room', 'version']);
  await page.getByRole('button', { name: 'Catalog' }).click();
});

test('custom reset confirmation supports cancel and confirm', async ({ monitoredPage: page }) => {
  await openApp(page); await addAsset(page, 'chairs', 'chair');
  let nativeDialog = false; page.on('dialog', () => { nativeDialog = true; });
  await page.getByRole('button', { name: 'Project menu' }).click(); await page.getByRole('button', { name: 'Reset project' }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Cancel reset' }).click();
  expect((await project(page)).objects).toHaveLength(1);
  await page.getByRole('button', { name: 'Project menu' }).click(); await page.getByRole('button', { name: 'Reset project' }).click(); await page.getByRole('button', { name: 'Confirm reset' }).click();
  await expect.poll(async () => (await project(page)).objects.length).toBe(0); expect(nativeDialog).toBe(false);
});

test('touch owned by sheet does not move camera or furniture', async ({ monitoredPage: page }) => {
  await openApp(page); const object = await addAsset(page, 'chairs', 'chair');
  const camera = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  const position = (await project(page)).objects.find((item) => item.instanceId === object.instanceId)!.position;
  const box = (await page.getByTestId('workspace-sheet').boundingBox())!;
  const gesture = await TouchGesture.start(page, { x: box.x + box.width * .6, y: box.y + box.height * .7 });
  await gesture.move({ x: box.x + box.width * .25, y: box.y + box.height * .7 }, 5); await gesture.end();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState())).toEqual(camera);
  expect((await project(page)).objects.find((item) => item.instanceId === object.instanceId)!.position).toEqual(position);
});

test('Fit Room restores a usable room framing', async ({ monitoredPage: page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Fit Room' }).click();
  const sheetBox = (await page.getByTestId('workspace-sheet').boundingBox())!;
  const canvasBefore = (await page.locator('canvas').boundingBox())!;
  const usableBottom = sheetBox.x === 0 ? sheetBox.y + 12 : canvasBefore.y + canvasBefore.height + 12;
  await expect.poll(async () => { const bounds = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRoomScreenBounds()); return bounds ? bounds.y + bounds.height : Number.POSITIVE_INFINITY; }).toBeLessThan(usableBottom);
  const initial = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * .35, canvas.y + canvas.height * .42);
  await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width * .62, canvas.y + canvas.height * .42, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => page.evaluate((x) => Math.abs(window.__INTERIOR_MAGIC_TEST__!.getCameraState()!.position.x - x), initial!.position.x)).toBeGreaterThan(.1);
  await page.getByRole('button', { name: 'Fit Room' }).click();
  await expect.poll(async () => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState()!.position.x), { timeout: 5_000 }).toBeGreaterThan(3);
  const fitted = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  expect(fitted!.position.x).toBeGreaterThan(3); expect(fitted!.position.z).toBeGreaterThan(4);
  const room = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRoomScreenBounds());
  const canvasBox = (await page.locator('canvas').boundingBox())!;
  expect(room).not.toBeNull();
  expect(room!.x).toBeGreaterThanOrEqual(canvasBox.x - 12); expect(room!.x + room!.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 12);
  expect(room!.y).toBeGreaterThanOrEqual(canvasBox.y - 12); expect(room!.y + room!.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 12);
});
