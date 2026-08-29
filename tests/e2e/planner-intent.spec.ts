import { expect, test } from './fixtures';

test('remote TV intent → deterministic planner → Preview → Apply → Undo → Redo', async ({ monitoredPage: page }) => {
  const requests: unknown[] = [];
  await page.route('https://intent.test/planning-intent', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        ok: true,
        contractVersion: 2,
        output: { activity: 'watchTv', focalPointId: 'room-object:test-tv' },
      }),
    });
  });

  await page.goto('/?planning-test-room=improved');
  await expect(page.getByTestId('planner-entry')).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.hasPlanningIntentAnalysis()),
    { timeout: 15_000 },
  ).toBe(true);
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  const originalSession = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary());

  await page.getByTestId('planner-entry').click();
  await expect(page.getByTestId('planner-panel')).toBeVisible();
  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.beginPlanningIntentAnalysis(
    'Сделай удобнее смотреть телевизор',
  ));
  await expect.poll(
    () => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().status),
    { timeout: 15_000 },
  ).toBe('ready');
  expect(requests).toEqual([{
    contractVersion: 2,
    text: 'Сделай удобнее смотреть телевизор',
    focals: [{ id: 'room-object:test-tv', kind: 'tv' }],
  }]);
  const proposal = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().proposal);
  expect(proposal?.moves.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(originalSession.undoCount);

  await page.getByTestId('planner-preview-button').click();
  await expect(page.getByTestId('planner-apply')).toBeVisible();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  await page.getByTestId('planner-apply').click();
  const applied = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(applied).not.toEqual(original);
  expect((await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getSessionSummary())).undoCount).toBe(originalSession.undoCount + 1);

  await page.getByTestId('toolbar-undo').click();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
  await page.getByTestId('toolbar-redo').click();
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(applied);
});

test('zero-TV Conversation intent reaches the deterministic Conversation planner', async ({ monitoredPage: page }) => {
  const requests: unknown[] = [];
  await page.route('https://intent.test/planning-intent', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, contractVersion: 2, output: { activity: 'conversation' } }),
    });
  });

  await page.goto('/?planning-test-room=no-tv');
  await expect(page.getByTestId('planner-entry')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.hasPlanningIntentAnalysis())).toBe(true);
  const original = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.beginPlanningIntentAnalysis(
    'Сделай удобнее для общения с гостями',
  ));
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().status)).toBe('ready');
  expect(requests).toEqual([{
    contractVersion: 2,
    text: 'Сделай удобнее для общения с гостями',
    focals: [],
  }]);
  const proposal = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getPlannerSnapshot().proposal);
  expect(proposal?.moves.length).toBeGreaterThan(0);
  expect(proposal?.findings.some((finding) => finding.ruleId === 'conversation.facing')).toBe(true);
  expect(await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject())).toEqual(original);
});
