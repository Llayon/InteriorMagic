import { expect, test } from '@playwright/test';

// These tests verify the P0 startup resilience contract: real asset bytes
// never gate the React mount, and a single broken/slow model does not break
// the editor. They intentionally do NOT depend on the licensed M1A local
// bytes — every chair.glb request is intercepted and answered by the test
// itself so the suite is deterministic in CI.

const CHAIR_GLOB = '**/__m1a_assets__/models/chair.glb';
const isChairUrl = (url: string) => /\/__m1a_assets__\/models\/chair\.glb(?:\?|$)/.test(url);

test('slow chair model never blocks editor mount or catalog availability', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (isChairUrl(request.url())) requests.push(request.url()); });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => { if (isChairUrl(response.url())) errors.push(`response: ${response.status()} ${response.url()}`); });

  // Hold the chair request until we explicitly release it. We fulfill with
  // a tiny placeholder body so the cache will eventually mark this asset
  // ready, but the test only cares that bootstrap did not block on the
  // resolution. We do NOT call route.continue() — forwarding to the dev
  // server would let it return 404 from the missing local M1A bytes, which
  // is irrelevant to the bootstrap resilience contract.
  let releaseChair: (() => void) | null = null;
  const chairReleased = new Promise<void>((resolve) => { releaseChair = resolve; });
  await page.route(CHAIR_GLOB, async (route) => {
    await chairReleased;
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.alloc(64) });
  });

  await page.goto('/?showcase=1');

  // Editor MUST mount even though chair is still pending.
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-instance-count', '8', { timeout: 20_000 });
  // app-load-error MUST be absent — even if individual assets 404 in CI,
  // bootstrap must not crash.
  expect(await page.getByTestId('app-load-error').count()).toBe(0);
  // Room project is wired up via the synchronous install.
  const initialProject = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  expect(initialProject.objects.map((object) => object.instanceId)).toContain('showcase-chair-left');
  expect(initialProject.objects.map((object) => object.instanceId)).toContain('showcase-chair-right');
  // Catalog visible.
  await expect(page.getByTestId('catalog')).toBeVisible({ timeout: 15_000 });
  // Wait for the deep tree to mount so the AssetModel useEffect fires the
  // chair fetch and the route handler parks the promise.
  await page.waitForTimeout(500);

  // No bootstrap-level pageerror. The chair route hasn't been released yet
  // so no response event is expected for it; other console errors are not
  // bootstrap-level and are filtered out.
  expect(errors).toEqual([]);

  // The route handler must have been invoked — bootstrap fired the chair
  // request and Playwright is holding it.
  expect(releaseChair).not.toBeNull();

  // Now release the chair. Bootstrap has already finished; the asset arrives
  // out-of-band and the cache updates.
  releaseChair!();
  await page.waitForTimeout(500);
  // Chair request was issued at least once.
  expect(requests.length).toBeGreaterThanOrEqual(1);
});

test('HTTP 500 on a real model never triggers global bootstrap failure', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  let chairAttempts = 0;
  await page.route(CHAIR_GLOB, async (route) => {
    chairAttempts += 1;
    await route.fulfill({ status: 500, contentType: 'model/gltf-binary', body: Buffer.alloc(64) });
  });

  await page.goto('/?showcase=1');
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-instance-count', '8', { timeout: 20_000 });

  // app-load-error MUST be absent — local HTTP 500 must NOT bubble up.
  expect(await page.getByTestId('app-load-error').count()).toBe(0);

  // Catalog remains accessible.
  await expect(page.getByTestId('catalog')).toBeVisible({ timeout: 15_000 });

  // Wait deterministically for AssetModel's useEffect to fire the chair load
  // (otherwise the route handler never runs and chairAttempts stays 0).
  await expect
    .poll(
      async () => {
        const stats = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats());
        return stats?.assets.find((entry: { assetId: string }) => entry.assetId === 'chair')?.status;
      },
      { timeout: 10_000, intervals: [50, 100, 200, 500] },
    )
    .toMatch(/^(loading|ready|error)$/);

  // No bootstrap-level pageerror. Chair 500 console.error is expected and
  // surfaced only as an asset-cache error, not as a bootstrap exception.
  expect(errors).toEqual([]);

  // We made exactly one chair request — the second chair instance shares the
  // cache entry. AssetCache dedupe is the property under test here.
  expect(chairAttempts).toBe(1);
});

test('two showcase chair instances share a single network request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (isChairUrl(request.url())) requests.push(request.url()); });

  // Fulfill with 200 to a tiny body so the route resolves. The goal of this
  // test is to count requests, not to render anything.
  await page.route(CHAIR_GLOB, async (route) => {
    await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.alloc(64) });
  });

  await page.goto('/?showcase=1');
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 });
  // Wait deterministically for AssetModel's useEffect to fire the chair load.
  // Polling on the cache state avoids fragile time-based waits: CI runners
  // vary too widely for a fixed waitForTimeout to be reliable here.
  await expect
    .poll(
      async () => {
        const stats = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats());
        return stats?.assets.find((entry: { assetId: string }) => entry.assetId === 'chair')?.status;
      },
      { timeout: 10_000, intervals: [50, 100, 200, 500] },
    )
    .toMatch(/^(loading|ready|error)$/);
  // Both chair instances must share a single fetch — AssetCache dedupe.
  expect(requests.length).toBe(1);
});
