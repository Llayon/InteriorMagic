import { test, expect } from './fixtures';
import { addAsset, openApp, project, proxyBounds, TouchGesture } from './helpers';

test.skip('two-finger furniture rotation stays transient until one atomic commit', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  const bounds = await proxyBounds(page, chair.instanceId);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const before = await project(page);
  const gesture = await TouchGesture.start(page, { x: center.x - bounds.width * .2, y: center.y });
  await gesture.add({ x: center.x + bounds.width * .2, y: center.y });
  await gesture.movePointer({ x: center.x + bounds.width * .18, y: center.y + 1 });
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().interactionMode)).toBe('rotating');
  await gesture.movePointer({ x: center.x + 18, y: center.y + 24 });
  const transient = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id), chair.instanceId);
  expect(transient?.rotationY).not.toBe(before.objects[0]!.rotationY);
  expect((await project(page)).objects[0]!.rotationY).toBe(before.objects[0]!.rotationY);
  await gesture.end();
  await expect.poll(async () => (await project(page)).objects[0]!.rotationY).not.toBe(before.objects[0]!.rotationY);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount)).toBe(2);
});
