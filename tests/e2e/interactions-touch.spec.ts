import { test, expect } from './fixtures';
import { addAsset, openApp, project, proxyBounds, TouchGesture, type Point } from './helpers';

const distance2 = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const distance3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('selects an interaction proxy through a touch tap', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  const canvas = await page.locator('canvas').boundingBox();
  await page.touchscreen.tap(canvas!.x + 6, canvas!.y + 6);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSelectedInstanceId())).toBeNull();
  const bounds = await proxyBounds(page, chair.instanceId);
  await page.touchscreen.tap(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.55);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSelectedInstanceId())).toBe(chair.instanceId);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getInteractionState().lastPointerType)).toBe('touch');
});

test('preserves a touch edge grab, commits once, and isolates the camera', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  const bounds = await proxyBounds(page, chair.instanceId);
  const start = { x: bounds.x + bounds.width * 0.24, y: bounds.y + bounds.height * 0.57 };
  const objectScreenBefore = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getObjectScreenPosition(id), chair.instanceId);
  const offsetBefore = { x: objectScreenBefore!.x - start.x, y: objectScreenBefore!.y - start.y };
  const cameraBefore = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  const historyBefore = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount);

  const gesture = await TouchGesture.start(page, start);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getInteractionState())).toMatchObject({ active: true, pointerType: 'touch' });
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState()?.controlsEnabled)).toBe(false);
  const firstMove = { x: start.x + 18, y: start.y + 8 };
  await gesture.move(firstMove);
  await expect.poll(async () => {
    const objectScreen = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getObjectScreenPosition(id), chair.instanceId);
    return distance2({ x: objectScreen!.x - firstMove.x, y: objectScreen!.y - firstMove.y }, offsetBefore);
  }).toBeLessThanOrEqual(8);
  await gesture.move({ x: start.x + 105, y: start.y + 24 }, 10);
  await gesture.end();

  const moved = (await project(page)).objects.find((object) => object.instanceId === chair.instanceId)!;
  expect(Math.hypot(moved.position.x - chair.position.x, moved.position.z - chair.position.z)).toBeGreaterThan(0.05);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount)).toBe(historyBefore + 1);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getInteractionState())).toMatchObject({ active: false, pointerType: null, lastPointerType: 'touch', lastEndReason: 'commit' });
  const cameraAfter = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  expect(cameraAfter!.controlsEnabled).toBe(true);
  expect(distance3(cameraAfter!.position, cameraBefore!.position)).toBeLessThan(0.002);
  expect(distance3(cameraAfter!.target, cameraBefore!.target)).toBeLessThan(0.002);
});

test('touch cancel restores the object and camera without history', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  const bounds = await proxyBounds(page, chair.instanceId);
  const start = { x: bounds.x + bounds.width * 0.3, y: bounds.y + bounds.height * 0.55 };
  const historyBefore = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount);
  const cameraBefore = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  const gesture = await TouchGesture.start(page, start);
  await gesture.move({ x: start.x + 85, y: start.y + 18 }, 8);
  await expect.poll(async () => {
    const rendered = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id), chair.instanceId);
    return Math.hypot(rendered!.position.x - chair.position.x, rendered!.position.z - chair.position.z);
  }).toBeGreaterThan(0.05);
  const pointerId = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getInteractionState().pointerId);
  expect(pointerId).not.toBeNull();
  await page.locator('canvas').evaluate((canvas, id) => {
    if (!canvas.hasPointerCapture(id)) throw new Error(`Canvas does not own pointer capture ${id}`);
    canvas.releasePointerCapture(id);
  }, pointerId!);
  await gesture.cancel();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getInteractionState())).toMatchObject({ active: false, pointerType: null, lastPointerType: 'touch', lastEndReason: 'cancel' });
  const rendered = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id), chair.instanceId);
  expect(rendered!.position).toEqual(chair.position);
  expect((await project(page)).objects.find((object) => object.instanceId === chair.instanceId)!.position).toEqual(chair.position);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount)).toBe(historyBefore);
  const cameraAfter = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  expect(cameraAfter!.controlsEnabled).toBe(true);
  expect(distance3(cameraAfter!.position, cameraBefore!.position)).toBeLessThan(0.002);
  expect(distance3(cameraAfter!.target, cameraBefore!.target)).toBeLessThan(0.002);
});
