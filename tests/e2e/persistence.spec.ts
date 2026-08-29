import { test, expect } from './fixtures';
import { addAsset, openApp, project, waitForEditorReady } from './helpers';

test('restores objects, transforms and finishes after save and reload', async ({ monitoredPage: page }) => {
  await openApp(page);
  await addAsset(page, 'chairs', 'chair');
  await addAsset(page, 'tables', 'table');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await page.getByRole('button', { name: 'Materials' }).click();
  await page.getByRole('button', { name: 'floor finish walnut' }).click();
  await page.getByRole('button', { name: 'wall finish mist' }).click();
  const expected = await project(page);
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'Save project' }).click();
  await page.reload();
  await waitForEditorReady(page);
  await expect.poll(async () => (await project(page)).objects.length).toBe(2);
  expect(await project(page)).toEqual(expected);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).toMatchObject({ undoCount: 0, redoCount: 0 });
});

test('H3B: local mutation survives reload without a manual Save', async ({ monitoredPage: page }) => {
  await openApp(page);
  await addAsset(page, 'chairs', 'chair');
  const expected = await project(page);
  // No explicit Save: the persistence seam must have written already.
  await page.reload();
  await waitForEditorReady(page);
  await expect.poll(async () => (await project(page)).objects.length).toBe(1);
  expect(await project(page)).toEqual(expected);
});
