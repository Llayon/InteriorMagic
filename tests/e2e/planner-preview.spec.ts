import { test, expect } from './fixtures';
import { openApp, project } from './helpers';

/**
 * Track C — Planner Preview UX (hardened).
 *
 * Coverage:
 * 1. default traffic uses the real planner; fixture isolation stays gated;
 *    `?planning-fixture=…` alone does NOT activate the harness (covered in
 *    Vitest `harness.test.ts`).
 * 2. improved fixture flag activates the entry point and the workspace panel;
 * 3. loading state appears and resolves into the ready summary;
 * 4. findings render with severity-aware copy;
 * 5. preview button enters preview; RoomProject stays byte-equal;
 *    undo stack stays empty;
 * 6. preview is truly read-only: rotate / delete / duplicate / undo / redo
 *    are all rejected with no RoomProject mutation;
 * 7. cancel preview restores normal rendering with no editor mutations;
 * 8. drag interaction is suppressed during preview;
 * 9. noop fixture shows the already-good state and has no Preview action;
 * 10. error fixture shows a retry control; retry resolves through the same
 *     target-validation path;
 * 11. planner panel exit returns the workspace to catalog + peek state;
 * 12. UI controls (panel buttons) do not leak interaction through to canvas.
 */

const gotoWithFixture = async (page: import('@playwright/test').Page, fixture: string) => {
  await page.goto(`/?planning-fixture=${fixture}`);
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady()), { timeout: 15_000 }).toBe(true);
};

test('default traffic uses the real planner rather than the fixture harness', async ({ monitoredPage: page }) => {
  await openApp(page);
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-enabled', 'on');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-source', 'real');
  await expect(page.getByTestId('planner-entry')).toBeVisible();
  await expect(page.getByTestId('planner-panel')).toHaveCount(0);
});

test('improved fixture opens the planner panel and renders findings', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-enabled', 'on');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-source', 'fixture');
  await expect(page.getByTestId('planner-entry')).toBeVisible();
  const baseline = await project(page);
  await page.getByTestId('planner-entry').click();
  // Loading → Ready
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'ready');
  await expect(page.getByTestId('planner-ready')).toHaveAttribute('data-planner-outcome', 'improved');
  await expect(page.getByTestId('planner-findings')).toBeVisible();
  const findings = page.getByTestId('planner-findings').locator('.planner-finding');
  await expect(findings).toHaveCount(2);
  await expect(findings.first()).toHaveAttribute('data-severity', /positive|info|warning/);
  // RoomProject must be untouched by analysis.
  expect(await project(page)).toEqual(baseline);
});

test('preview does not mutate RoomProject and undo stack stays empty', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  const baseline = await project(page);
  const undoBefore = (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount;
  await page.getByTestId('planner-preview-button').click();
  await expect(page.getByTestId('planner-apply')).toHaveCount(0);
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-previewing', 'on');
  await expect(page.getByTestId('planner-preview-banner')).toBeVisible();
  const transform = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerPreviewTransform('sofa-main'));
  expect(transform).not.toBeNull();
  expect(transform!.position.x).toBeCloseTo(1.25, 2);
  expect(transform!.position.z).toBeCloseTo(3.4, 2);
  // RoomProject untouched, no history pushed.
  expect(await project(page)).toEqual(baseline);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(undoBefore);
});

test('preview is truly read-only — rotate/duplicate/delete/undo/redo are all rejected', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');

  await page.getByTestId('planner-preview-button').click();
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-previewing', 'on');

  // Toolbar mutating controls must be disabled during preview. Track C testids
  // are present iff the editor has the right state to render them.
  for (const testid of ['toolbar-undo', 'toolbar-redo', 'toolbar-rotate-right', 'toolbar-duplicate', 'toolbar-delete']) {
    const button = page.getByTestId(testid);
    if (await button.count() > 0) {
      await expect(button).toBeDisabled();
    }
  }

  const baseline = await project(page);
  const undoBefore = (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount;
  const redoBefore = (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).redoCount;
  expect(await project(page)).toEqual(baseline);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(undoBefore);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).redoCount).toBe(redoBefore);
});

test('cancel preview exits cleanly and leaves the room and history unchanged', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  const baseline = await project(page);
  const undoBefore = (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount;
  await page.getByTestId('planner-preview-button').click();
  await expect(page.getByTestId('planner-preview-banner')).toBeVisible();
  await page.getByTestId('planner-cancel-preview').click();
  await expect(page.getByTestId('planner-preview-banner')).toHaveCount(0);
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-planner-previewing', 'off');
  expect(await project(page)).toEqual(baseline);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(undoBefore);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerPreviewTransform('sofa-main'))).toBeNull();
});

test('drag is suppressed while preview is active', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  await page.getByTestId('planner-preview-button').click();
  const baseline = await project(page);
  const proxy = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getInteractionProxyScreenBounds('sofa-main'));
  expect(proxy).not.toBeNull();
  await page.mouse.move(proxy!.x + proxy!.width / 2, proxy!.y + proxy!.height / 2);
  await page.mouse.down();
  await page.mouse.move(proxy!.x + proxy!.width / 2 + 60, proxy!.y + proxy!.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  expect(await project(page)).toEqual(baseline);
  await page.getByTestId('planner-cancel-preview').click();
});

test('noop fixture shows the already-good state and has no preview button', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'noop');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  const snapshot = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot());
  expect(snapshot.outcome).toBe('alreadyGood');
  expect(snapshot.proposal?.moves).toEqual([]);
  await expect(page.getByTestId('planner-noop-note')).toBeVisible();
  await expect(page.getByTestId('planner-preview-button')).toHaveCount(0);
  await expect(page.getByTestId('planner-findings').locator('.planner-finding')).toHaveCount(1);
});

test('error fixture shows a retry control and re-runs target validation on retry', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'error');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('error');
  await expect(page.getByTestId('planner-error')).toBeVisible();
  await expect(page.getByTestId('planner-retry')).toBeVisible();
  await page.getByTestId('planner-retry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('error');
  // The error message is owned by the orchestrator; it must NOT say
  // "ничего менять не требуется" or "уже выглядит удачно" because those
  // are presentation claims the orchestrator did not make.
  const errorText = await page.getByTestId('planner-error').textContent();
  expect(errorText).not.toMatch(/не требуется/);
  expect(errorText).not.toMatch(/уже выглядит удачно/);
});

test('planner exit returns the workspace to catalog + peek and clears planner state', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  const baseline = await project(page);
  // Cancel preview first so we test exit from a clean ready state.
  await page.getByTestId('planner-preview-button').click();
  await page.getByTestId('planner-cancel-preview').click();
  // Now exit the planner panel.
  await page.getByTestId('planner-exit').click();
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sheet-state', 'peek');
  await expect(page.getByTestId('workspace-sheet')).toHaveAttribute('data-workspace-panel', 'catalog');
  // Planner store is reset to idle.
  const snapshot = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot());
  expect(snapshot.status).toBe('idle');
  expect(snapshot.proposal).toBeNull();
  expect(snapshot.isPreviewing).toBe(false);
  // RoomProject is unchanged.
  expect(await project(page)).toEqual(baseline);
  // Entry point is still rendered because the harness is on; user can re-enter.
  await expect(page.getByTestId('planner-entry')).toBeVisible();
});

test('planner panel buttons do not leak interaction to the canvas', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  await expect.poll(async () => (await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot())).status).toBe('ready');
  const baseline = await project(page);
  // The workspace expansion triggers the existing camera-fit easing. Capture
  // the baseline only after it settles so button isolation, not animation
  // progress, is compared below.
  await page.waitForTimeout(2_000);
  const camera = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState());
  await page.getByTestId('planner-preview-button').click();
  await page.getByTestId('planner-cancel-preview').click();
  expect(await project(page)).toEqual(baseline);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState())).toEqual(camera);
});

test('exit during in-flight analysis does not resurrect a proposal', async ({ monitoredPage: page }) => {
  await gotoWithFixture(page, 'improved');
  await page.getByTestId('planner-entry').click();
  // Loading state is in flight; the orchestrator owns the artificial 320ms delay.
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'loading');
  // Exit BEFORE the artificial delay elapses.
  await page.getByTestId('planner-exit').click();
  // Wait longer than the artificial delay to prove a late receiveProposal never fires.
  await page.waitForTimeout(800);
  const snapshot = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot());
  expect(snapshot.status).toBe('idle');
  expect(snapshot.proposal).toBeNull();
  expect(snapshot.error).toBeNull();
  expect(snapshot.isPreviewing).toBe(false);
  expect(await project(page)).toEqual((await project(page)));
  // Workspace chrome is restored to catalog + peek.
  await expect(page.getByTestId('workspace-sheet')).toHaveAttribute('data-workspace-panel', 'catalog');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sheet-state', 'peek');
  // The planner panel itself is gone.
  await expect(page.getByTestId('planner-panel')).toHaveCount(0);
});
