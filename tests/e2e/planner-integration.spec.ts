import { expect, test } from './fixtures';

const openRealRoom = async (page: import('@playwright/test').Page, room: 'improved' | 'already-good' | 'no-tv', extra = '') => {
  await page.goto(`/?planning-test-room=${room}${extra}`);
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-source', 'real');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady()), { timeout: 15_000 }).toBe(true);
};

const plannerSnapshot = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot());

test('real Analyze → Preview → atomic Apply → Undo → Redo', async ({ monitoredPage: page }) => {
  await openRealRoom(page, 'improved');
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  const originalSession = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary());
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await plannerSnapshot(page)).status).toBe('ready');
  const proposal = (await plannerSnapshot(page)).proposal!;
  expect(proposal.moves.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(originalSession.undoCount);

  await page.getByTestId('planner-preview-button').click();
  await expect(page.getByTestId('planner-apply')).toBeVisible();
  const firstMove = proposal.moves[0]!;
  const rendered = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getRenderedTransform(id), firstMove.instanceId);
  expect(rendered?.position.x).toBeCloseTo(firstMove.position.x, 3);
  expect(rendered?.position.z).toBeCloseTo(firstMove.position.z, 3);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);

  await page.getByTestId('planner-apply').click();
  await expect(page.getByTestId('planner-panel')).toHaveCount(0);
  const applied = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(applied).not.toEqual(original);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(originalSession.undoCount + 1);

  await page.getByTestId('toolbar-undo').click();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  await page.getByTestId('toolbar-redo').click();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(applied);
});

test('stale proposal is rejected without planner mutation or history addition', async ({ monitoredPage: page }) => {
  await openRealRoom(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await plannerSnapshot(page)).status).toBe('ready');
  await page.getByTestId('planner-preview-button').click();
  const plant = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getObject('test-plant'));
  await page.evaluate((position) => window.__INTERIOR_MAGIC_TEST__!.moveObjectForTest('test-plant', position), {
    x: plant!.position.x - .15, y: plant!.position.y, z: plant!.position.z,
  });
  const changed = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  const history = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary());
  await page.getByTestId('planner-apply').click();
  await expect.poll(async () => (await plannerSnapshot(page)).applyFailure).toBe('stale');
  await expect(page.getByTestId('planner-error')).toContainText('Комната изменилась');
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(changed);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).toEqual(history);
});

test('already-good real room has no preview or Apply affordance', async ({ monitoredPage: page }) => {
  await openRealRoom(page, 'already-good');
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await plannerSnapshot(page)).status).toBe('ready');
  expect((await plannerSnapshot(page)).outcome).toBe('alreadyGood');
  await expect(page.getByTestId('planner-preview-button')).toHaveCount(0);
  await expect(page.getByTestId('planner-apply')).toHaveCount(0);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
});

test('room without authoritative TV produces a controlled precondition error', async ({ monitoredPage: page }) => {
  await openRealRoom(page, 'no-tv');
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await plannerSnapshot(page)).status).toBe('error');
  await expect(page.getByTestId('planner-error')).toContainText('телевизор');
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(0);
});

test('exit cancels delayed real analysis without proposal resurrection', async ({ monitoredPage: page }) => {
  await openRealRoom(page, 'improved', '&planning-delay=1');
  await page.getByTestId('planner-entry').click();
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'loading');
  await page.getByTestId('planner-exit').click();
  await page.waitForTimeout(700);
  expect(await plannerSnapshot(page)).toMatchObject({ status: 'idle', proposal: null, isPreviewing: false });
});

test('Device QA remains opt-in and compatible with the real planner entry', async ({ monitoredPage: page }) => {
  await openRealRoom(page, 'improved', '&deviceQa=1');
  await expect(page.getByTestId('device-qa')).toBeVisible();
  await expect(page.getByTestId('planner-entry')).toBeVisible();
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRendererStats())).frameloop).toBe('demand');
});
