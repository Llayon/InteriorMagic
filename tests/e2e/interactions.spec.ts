import { test, expect } from './fixtures';
import { addAsset, drag, openApp, project, proxyBounds } from './helpers';

test('selects through proxy and commits one edge-grab move', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  const canvas = await page.locator('canvas').boundingBox();
  expect(canvas).not.toBeNull();
  await page.mouse.click(canvas!.x + 6, canvas!.y + 6);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSelectedInstanceId())).toBeNull();
  const bounds = await proxyBounds(page, chair.instanceId);
  const edge = { x: bounds.x + bounds.width * 0.22, y: bounds.y + bounds.height * 0.58 };
  await page.mouse.click(edge.x, edge.y);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSelectedInstanceId())).toBe(chair.instanceId);

  const before = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id), chair.instanceId);
  const historyBefore = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount);
  await page.mouse.move(edge.x, edge.y); await page.mouse.down();
  await page.mouse.move(edge.x + 8, edge.y + 4, { steps: 2 });
  const early = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id), chair.instanceId);
  expect(Math.hypot(early!.position.x - before!.position.x, early!.position.z - before!.position.z)).toBeLessThan(0.35);
  await page.mouse.move(edge.x + 110, edge.y + 20, { steps: 10 }); await page.mouse.up();
  const after = (await project(page)).objects.find((object) => object.instanceId === chair.instanceId)!;
  expect(Math.hypot(after.position.x - chair.position.x, after.position.z - chair.position.z)).toBeGreaterThan(0.05);
  const info = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getPlacementInfo(id), chair.instanceId);
  expect(Math.abs(after.position.x)).toBeLessThanOrEqual(info!.room.width / 2);
  expect(Math.abs(after.position.z)).toBeLessThanOrEqual(info!.room.depth / 2);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary().undoCount)).toBe(historyBefore + 1);
});

test('connects rug overlap, collision rejection, and wall snap to pointer drag', async ({ monitoredPage: page }) => {
  await openApp(page);
  const rug = await addAsset(page, 'rugs', 'rug');
  const sofa = await addAsset(page, 'sofas', 'sofa');
  expect(Math.hypot(rug.position.x - sofa.position.x, rug.position.z - sofa.position.z)).toBeLessThan(0.05);
  const chair = await addAsset(page, 'chairs', 'chair');
  const chairBefore = { ...chair.position };
  const chairBounds = await proxyBounds(page, chair.instanceId);
  const sofaPoint = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getObjectScreenPosition(id), sofa.instanceId);
  await drag(page, { x: chairBounds.x + chairBounds.width / 2, y: chairBounds.y + chairBounds.height / 2 }, sofaPoint!);
  const rejected = (await project(page)).objects.find((object) => object.instanceId === chair.instanceId)!;
  expect(Math.hypot(rejected.position.x - chairBefore.x, rejected.position.z - chairBefore.z)).toBeLessThan(0.05);

  const bounds = await proxyBounds(page, chair.instanceId);
  const placement = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getPlacementInfo(id), chair.instanceId);
  const targetX = -placement!.room.width / 2 + placement!.footprint.width / 2 + 0.03;
  const targetZ = placement!.room.depth / 2 - placement!.footprint.depth / 2 - 0.25;
  const currentFloor = await page.evaluate(({ x, z }) => window.__INTERIOR_MAGIC_TEST__!.projectWorldPoint({ x, y: 0, z }), { x: rejected.position.x, z: rejected.position.z });
  const targetFloor = await page.evaluate(({ x, z }) => window.__INTERIOR_MAGIC_TEST__!.projectWorldPoint({ x, y: 0, z }), { x: targetX, z: targetZ });
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const target = { x: start.x + targetFloor!.x - currentFloor!.x, y: start.y + targetFloor!.y - currentFloor!.y };
  await drag(page, start, target);
  const snapped = (await project(page)).objects.find((object) => object.instanceId === chair.instanceId)!;
  expect(snapped.position.x).toBeCloseTo(-placement!.room.width / 2 + placement!.footprint.width / 2, 2);
});

test('rotates and traverses history through toolbar controls', async ({ monitoredPage: page }) => {
  await openApp(page);
  const chair = await addAsset(page, 'chairs', 'chair');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  const rotated = (await project(page)).objects[0]!.rotationY;
  expect(rotated).not.toBe(chair.rotationY);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await project(page)).objects[0]!.rotationY).toBe(chair.rotationY);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await project(page)).objects[0]!.rotationY).toBe(rotated);
});
