import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const VIEWPORT_MARGIN = 16;
const PROJECTION_TOLERANCE = 3;
const ALLOWED_SEED_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

const openShowcase = async (page: Page) => {
  await page.goto('/?showcase=1');
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady()), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets), { timeout: 20_000 }).toBe(7);
};

const skipDesktop = (testInfo: TestInfo) => test.skip(!testInfo.project.name.startsWith('showcase-mobile'), 'Mobile product acceptance only');

const waitForSheetAndCamera = async (page: Page) => {
  // The sheet transition is 220ms; camera-controls then animates the fitted
  // camera. The gate observes the final real R3F camera, not a mocked matrix.
  await page.waitForTimeout(900);
};

const box = async (locator: Locator) => {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
};

const roomProjection = (page: Page) => page.evaluate((margin) => {
  const api = window.__INTERIOR_MAGIC_TEST__!;
  const root = document.querySelector<HTMLElement>('[data-testid="app-root"]')!;
  const header = document.querySelector<HTMLElement>('[data-testid="app-header"]')!;
  const sheet = document.querySelector<HTMLElement>('[data-testid="workspace-sheet"]')!;
  const canvas = api.getRendererStats().canvas!;
  const projectedRoom = api.getProjectedRoomBounds()!;
  const room = projectedRoom.bounds;
  const rootRect = root.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const sheetRect = sheet.getBoundingClientRect();
  const viewport = window.visualViewport;
  const visibleTop = viewport ? viewport.offsetTop : rootRect.top;
  const visibleLeft = viewport ? viewport.offsetLeft : rootRect.left;
  const visibleRight = viewport ? viewport.offsetLeft + viewport.width : rootRect.right;
  const visibleBottom = viewport ? viewport.offsetTop + viewport.height : rootRect.bottom;
  const usable = {
    left: Math.max(canvas.x, visibleLeft) + margin,
    right: Math.min(canvas.x + canvas.width, visibleRight) - margin,
    top: Math.max(canvas.y, visibleTop, headerRect.bottom) + margin,
    bottom: Math.min(canvas.y + canvas.height, visibleBottom, sheetRect.top) - margin,
  };
  return {
    room,
    corners: projectedRoom.corners,
    usable,
    camera: api.getCameraState(),
    workspace: api.getWorkspaceGeometry(),
    areaRatio: room.width * room.height / Math.max(1, (usable.right - usable.left) * (usable.bottom - usable.top)),
  };
}, VIEWPORT_MARGIN);

const expectRoomFitted = async (page: Page) => {
  const projection = await roomProjection(page);
  const evidence = JSON.stringify(projection);
  expect(projection.corners, evidence).toHaveLength(8);
  expect(projection.room.x, evidence).toBeGreaterThanOrEqual(projection.usable.left - PROJECTION_TOLERANCE);
  expect(projection.room.x + projection.room.width, evidence).toBeLessThanOrEqual(projection.usable.right + PROJECTION_TOLERANCE);
  expect(projection.room.y, evidence).toBeGreaterThanOrEqual(projection.usable.top - PROJECTION_TOLERANCE);
  expect(projection.room.y + projection.room.height, evidence).toBeLessThanOrEqual(projection.usable.bottom + PROJECTION_TOLERANCE);
  expect(projection.areaRatio, evidence).toBeGreaterThanOrEqual(0.32);
  return projection;
};

test('showcase opens with the room visibly framed and Home restores fitted bounds', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await openShowcase(page);
  await waitForSheetAndCamera(page);
  const initial = await expectRoomFitted(page);
  expect(initial.areaRatio).toBeLessThan(0.9);

  const canvas = await box(page.locator('canvas'));
  const cameraBeforeOrbit = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getCameraState()!);
  await page.mouse.move(canvas.x + canvas.width * 0.35, canvas.y + canvas.height * 0.38);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.58, canvas.y + canvas.height * 0.38, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate((beforeX) => Math.abs(window.__INTERIOR_MAGIC_TEST__!.getCameraState()!.position.x - beforeX), cameraBeforeOrbit.position.x)).toBeGreaterThan(0.1);
  await page.getByTestId('toolbar-fit-room').click();
  await waitForSheetAndCamera(page);
  await expectRoomFitted(page);
});

test('catalog peek reveals a complete product card', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await openShowcase(page);
  const sheet = await box(page.getByTestId('workspace-sheet'));
  const tabs = await box(page.getByRole('navigation', { name: 'Workspace panels' }));
  const categories = await box(page.locator('.categories'));
  const firstCard = await box(page.locator('.item-shell').first());
  const visibleBottom = await page.evaluate(() => window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight);
  expect(tabs.y).toBeGreaterThanOrEqual(sheet.y);
  expect(tabs.y + tabs.height).toBeLessThanOrEqual(sheet.y + sheet.height);
  expect(categories.height).toBeGreaterThanOrEqual(40);
  expect(firstCard.y).toBeGreaterThanOrEqual(categories.y + categories.height - 1);
  expect(firstCard.y + firstCard.height).toBeLessThanOrEqual(Math.min(sheet.y + sheet.height, visibleBottom) - 8);
});

test('expanded catalog exposes a scrollable grid and its final row', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await openShowcase(page);
  await page.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sheet-state', 'expanded');
  await waitForSheetAndCamera(page);
  const items = page.locator('.catalog-panel .items');
  expect(await items.evaluate((element) => getComputedStyle(element).display)).toBe('grid');
  expect(await items.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  const lastCard = page.locator('.item-shell').last();
  await lastCard.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  const finalBox = await box(lastCard);
  const sheet = await box(page.getByTestId('workspace-sheet'));
  const visibleBottom = await page.evaluate(() => window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight);
  expect(finalBox.y).toBeGreaterThanOrEqual(sheet.y);
  expect(finalBox.y + finalBox.height).toBeLessThanOrEqual(Math.min(sheet.y + sheet.height, visibleBottom) - 8);
});

test('planner keeps actions and the projected room in their usable regions', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await openShowcase(page);
  await page.getByTestId('planner-entry').click();
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'ready', { timeout: 15_000 });
  const tvProposal = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().proposal!);
  expect(tvProposal.moves).toHaveLength(1);
  expect(tvProposal.scoreAfter.total).toBeGreaterThan(tvProposal.scoreBefore.total);
  await waitForSheetAndCamera(page);
  await expect(page.locator('.planner-panel .sheet-title')).toBeVisible();
  await expectRoomFitted(page);
  const sheet = await box(page.getByTestId('workspace-sheet'));
  const actions = await box(page.locator('.planner-actions'));
  const preview = await box(page.getByTestId('planner-preview-button'));
  const contentScroll = page.getByTestId('planner-content-scroll');
  expect(await contentScroll.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await contentScroll.evaluate((element) => element.scrollHeight)).toBeGreaterThanOrEqual(
    await contentScroll.evaluate((element) => element.clientHeight),
  );
  expect(await contentScroll.evaluate((element) => element.scrollTop)).toBe(0);
  expect(actions.y + actions.height).toBeLessThanOrEqual(sheet.y + sheet.height - 8);
  expect(preview.y + preview.height).toBeLessThanOrEqual(sheet.y + sheet.height - 8);
  await page.getByTestId('planner-preview-button').click();
  await waitForSheetAndCamera(page);
  await expectRoomFitted(page);
});

test('Conversation planner keeps a genuine demonstrable outcome on the curated room', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await page.route('https://intent.test/planning-intent', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true, contractVersion: 2, output: { activity: 'conversation' } }),
  }));
  await openShowcase(page);
  await page.getByTestId('planner-entry').click();
  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.beginPlanningIntentAnalysis('Сделай удобнее для общения'));
  await expect(page.getByTestId('planner-panel')).toHaveAttribute('data-planner-status', 'ready', { timeout: 15_000 });
  const proposal = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().proposal!);
  expect(proposal.moves).toHaveLength(1);
  expect(proposal.scoreAfter.total).toBeGreaterThan(proposal.scoreBefore.total);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().outcome)).toBe('improved');
  await waitForSheetAndCamera(page);
  await expectRoomFitted(page);
  await expect(page.getByTestId('planner-preview-button')).toBeVisible();
});

test('global toolbar fits without label overflow or child overlap', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await openShowcase(page);
  const toolbar = await box(page.getByTestId('global-toolbar'));
  const visible = await page.evaluate(() => ({
    left: window.visualViewport?.offsetLeft ?? 0,
    right: (window.visualViewport?.offsetLeft ?? 0) + (window.visualViewport?.width ?? window.innerWidth),
  }));
  expect(toolbar.x).toBeGreaterThanOrEqual(visible.left + 12);
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(visible.right - 12);
  const children = await page.getByTestId('global-toolbar').locator(':scope > button').evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, right: rect.right, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth };
  }));
  for (const [index, child] of children.entries()) {
    expect(child.scrollWidth, `toolbar child ${index} overflows`).toBeLessThanOrEqual(child.clientWidth);
    if (index > 0) expect(children[index - 1]!.right).toBeLessThanOrEqual(child.left);
  }
});

test('showcase seed uses explicit snapped orientations', async ({ page }, testInfo) => {
  skipDesktop(testInfo);
  await openShowcase(page);
  const objects = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject().objects);
  for (const object of objects) {
    const degrees = ((object.rotationY * 180 / Math.PI) % 360 + 360) % 360;
    expect(ALLOWED_SEED_DEGREES.some((allowed) => Math.abs(allowed - degrees) < 1e-6), `${object.instanceId}: ${degrees} degrees`).toBe(true);
  }
});

test('generated PBR environment survives controlled WebGL loss and repeated restoration', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'showcase-mobile', 'One real-renderer lifecycle run is sufficient');
  await openShowcase(page);
  const before = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics());
  expect(before.environmentPresent).toBe(true);
  expect(before.environmentRevision).toBeGreaterThan(0);

  const forceCycle = async () => {
    const cycleStart = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics());
    const supported = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.forceWebglContextLoss());
    test.skip(!supported, 'Chromium does not expose WEBGL_lose_context in this environment');
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics().webglContextLostCount)).toBeGreaterThan(cycleStart.webglContextLostCount);
    expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.forceWebglContextRestore())).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics().webglContextRestoredCount), { timeout: 10_000 }).toBeGreaterThan(cycleStart.webglContextRestoredCount);
    await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics().environmentRevision), { timeout: 10_000 }).toBeGreaterThan(cycleStart.environmentRevision);
    await page.getByTestId('toolbar-fit-room').click();
    await waitForSheetAndCamera(page);
    const restored = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics());
    expect(restored).toMatchObject({ environmentPresent: true, contextLost: false });
    expect(restored.environmentBuildFailureCount).toBe(before.environmentBuildFailureCount);
    expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRendererStats().calls)).toBeGreaterThan(0);
    return restored;
  };

  const firstRestore = await forceCycle();
  const secondRestore = await forceCycle();
  expect(secondRestore.environmentRevision).toBe(firstRestore.environmentRevision + 1);
  expect(secondRestore.rendererTextures).not.toBeNull();
  expect(firstRestore.rendererTextures).not.toBeNull();
  expect(secondRestore.rendererTextures!).toBeLessThanOrEqual(firstRestore.rendererTextures! + 1);
});
