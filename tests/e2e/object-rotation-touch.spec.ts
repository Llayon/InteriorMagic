import { test, expect } from './fixtures';
import { addAsset, openApp, project, proxyBounds, TouchGesture } from './helpers';

test('two-finger furniture rotation stays transient until one atomic commit', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  const bounds = await proxyBounds(page, chair.instanceId);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const radius = Math.max(12, Math.min(bounds.width, bounds.height) * .2);
  const first = { x: center.x - radius, y: center.y };
  const second = { x: center.x + radius, y: center.y };
  const before = await project(page);
  const gesture = await TouchGesture.start(page, first);
  let gestureEnded = false;
  try {
    await gesture.add(second);
    await gesture.movePointer({ x: second.x - 1, y: second.y + 1 });
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().interactionMode)).toBe('rotating');
    // Rotate the second pointer a deterministic quarter turn around the first.
    // This stays outside the snap hysteresis at both supported mobile viewports.
    await gesture.movePointer({ x: first.x, y: first.y + radius * 2 });
    await expect.poll(() => page.evaluate(
      (id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id)?.rotationY,
      chair.instanceId,
    )).not.toBe(before.objects[0]!.rotationY);
    expect((await project(page)).objects[0]!.rotationY).toBe(before.objects[0]!.rotationY);
    await gesture.end();
    gestureEnded = true;
  } finally {
    if (!gestureEnded) await gesture.cancel().catch(() => undefined);
  }
  await expect.poll(async () => (await project(page)).objects[0]!.rotationY).not.toBe(before.objects[0]!.rotationY);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount)).toBe(2);
});
