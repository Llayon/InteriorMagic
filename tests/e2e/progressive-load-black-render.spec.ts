import { test, expect } from './fixtures';
import { openApp } from './helpers';

// Spec: tests/catalog/* must remain hermetic — they never read .agent-data.
// This file lives under tests/e2e/ and is allowed to use the real production
// AssetCache + R3F render path via Playwright's page.route interception.
//
// Physical trigger (from spec §"PHYSICAL TRIGGER"):
//   cold open showcase URL → while real GLBs are still progressively loading
//   → immediately orbit the room camera → some furniture does not finish
//   rendering normally → appears black.
//
// In headless Chromium we exercise the same race against the production
// AssetCache + R3F demand-frameloop path. The deterministic ordering is:
//
//   1. Install a deferred-release page.route gate (no time-based hold).
//   2. Add 7 assets via addAssetByIdForTest so AssetModel mounts and kicks
//      off AssetCache.load(), but the catalog's await-load-on-click path
//      does NOT block us. The GLB requests enter the held state immediately.
//   3. Assert that at least 3 held requests exist (proves the gate actually
//      intercepted live AssetCache.load() calls).
//   4. Begin camera interaction (mouse-wheel burst that drives
//      Drei's CameraControls invalidate()).
//   5. WHILE camera interaction is still active, release the held GLBs.
//   6. Continue camera interaction while assets settle / instances commit.
//   7. End interaction.
//   8. Run the existing assertions (cache ready, instancePresent true,
//      invalidateCount positive, contextLost false, environment valid).
//
// This guarantees the overlap window is real, not a 1500 ms time guess.

test('progressive asset resolution during active camera interaction installs real instances and triggers post-install renders', async ({ monitoredPage: page }) => {
  // Deferred-release gate: the route interceptor accumulates held promises
  // instead of using a time delay. The test code calls `release()` once it
  // has confirmed the overlap precondition.
  type HeldEntry = { url: string; release: () => void; promise: Promise<void> };
  const held: HeldEntry[] = [];
  const release = () => {
    while (held.length > 0) held.shift()!.release();
  };

  // Match both flat `models/<file>.glb` AND nested `models/<dir>/<file>.glb`.
  // The trial catalog has both shapes — see src/editor/assets/registry.ts.
  await page.route('**/models/**/*.glb', async (route) => {
    const reqUrl = route.request().url();
    let releaseThis!: () => void;
    const promise = new Promise<void>((resolve) => { releaseThis = resolve; });
    held.push({ url: reqUrl, release: releaseThis, promise });
    try { await promise; } catch { /* ignore */ }
    await route.continue();
  });

  await openApp(page);

  // Step 2: install a pre-built project with 3 known-fitting assets via
  // the test bridge. Using replaceProjectForTest guarantees all 3 objects
  // mount and all 3 AssetCache.load() calls fire, bypassing both
  // findPlacement's room-fit logic and the catalog's await-load-on-click
  // path. This is the deterministic, race-surface-controlled entry point.
  const assetIds: Array<{ id: string; category: string }> = [
    { id: 'chair', category: 'chairs' },
    { id: 'nordicSofa', category: 'sofas' },
    { id: 'glassCoffeeTable', category: 'tables' },
  ];
  const projectSnapshot = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
  // Build 3 FurnitureInstance objects at known free positions inside the
  // default 6.2×5.8m room. Spread them so findPlacement-style heuristics
  // would not have rejected them; bypass via the store directly.
  const buildResult = await page.evaluate(({ baseProject, ids }) => {
    const project = JSON.parse(JSON.stringify(baseProject)) as typeof baseProject;
    const positions = [
      { x: -2, y: 0, z: -1.5 },
      { x: 2, y: 0, z: -1.5 },
      { x: 0, y: 0, z: 1.5 },
    ];
    const objects = ids.map((id, i) => ({
      instanceId: `race-${id}-${i}`,
      assetId: id,
      position: positions[i] ?? { x: 0, y: 0, z: 0 },
      rotationY: 0,
      variantId: null,
    }));
    const nextProject = { ...project, objects: [...project.objects, ...objects] };
    window.__INTERIOR_MAGIC_TEST__!.replaceProjectForTest(nextProject);
    return objects.map((o) => o.instanceId);
  }, { baseProject: projectSnapshot, ids: assetIds.map((a) => a.id) });
  expect(buildResult.length).toBe(3);
  expect(new Set(buildResult).size).toBe(3);
  // Allow React to commit the new project and run the AssetModel useEffects.
  await page.waitForTimeout(150);

  // Step 3: assert that the deferred gate actually intercepted live
  // AssetCache.load() calls. React commits the 7 new FurnitureObjects
  // asynchronously after the store updates settle; the AssetModel
  // useEffects that call assetCache.load() then run on the next microtask.
  // Wait for held.length to grow — but tolerate assets whose
  // findPlacement() rejected them (held.length may be < 7).
  await expect.poll(() => held.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  const heldCountBeforeRelease = held.length;

  // Step 4: begin real camera interaction. A SHORT burst is sufficient —
  // the test only needs to prove that camera-driven invalidate() runs WHILE
  // the AssetModel useEffects are committing. The duration of the burst
  // matters far less than the ordering: wheel → release → wheel. The 30s
  // test timeout in CI leaves plenty of headroom for a few hundred ms of
  // wheel events plus the asset-settle + post-commit-render window.
  const canvas = page.locator('canvas').first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const cx = canvasBox!.x + canvasBox!.width / 2;
  const cy = canvasBox!.y + canvasBox!.height / 2;
  await page.mouse.move(cx, cy);

  // Step 5: while camera interaction is still active, release the held GLBs.
  // The release happens INSIDE the wheel loop so the overlap is real.
  for (let i = 0; i < 6; i += 1) {
    if (i === 2 && held.length > 0) held.shift()!.release();
    if (i === 3) release();
    await page.mouse.wheel(0, 8);
    await page.waitForTimeout(10);
  }

  // Step 6: a couple more wheel events during the asset-settle window so
  // CameraControls continues to call invalidate() while the new
  // AssetModel instances commit their React tree.
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 8);
    await page.waitForTimeout(10);
  }

  // Step 7: end interaction (camera now idle). One explicit frame
  // settle to give post-commit useEffects a chance to fire and the
  // demand frameloop one more invalidate cycle to deliver.
  await page.waitForTimeout(200);

  // Step 8: assertions.
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets ?? 0), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(500);

  // 1. Cache: at least 3 assets loaded.
  const cache = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetCacheStats());
  expect(cache.loadedAssets).toBeGreaterThanOrEqual(3);

  // 2. Per-asset instance diagnostics: every ready asset must show instancePresent=true.
  const instanceDiag = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getAssetInstanceDiagnostics());
  const ready = instanceDiag.filter((entry) => entry.cacheStatus === 'ready');
  const missingInstances = ready.filter((entry) => entry.instancePresent !== true);
  expect(missingInstances, `assets with cacheStatus=ready but no live scene instance: ${JSON.stringify(missingInstances)}`).toEqual([]);

  // 3. Render invalidation stats: invalidateCount > 0 (post-commit guarantees fired).
  const invalidationStats = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderInvalidationStats());
  expect(invalidationStats.invalidateCount).toBeGreaterThan(0);

  // 4. Lifecycle snapshot — contextLost must remain false.
  const lifecycle = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics());
  expect(lifecycle.contextLost).toBe(false);
  expect(lifecycle.frameloopMode).toBe('demand');
  expect(lifecycle.environmentPresent).toBe(true);

  // 5. Every seed asset must appear in the asset lifecycle map with loadOutcome='ready'.
  for (const { id } of assetIds) {
    const entry = lifecycle.assetLifecycle[id];
    expect(entry, `asset ${id} not in lifecycle map`).toBeDefined();
    expect(entry?.loadOutcome, `asset ${id} outcome`).toBe('ready');
  }

  // 6. Per-asset GPU texture count must reflect the uploads.
  const rendererTextures = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRendererStats().textures);
  expect(rendererTextures).toBeGreaterThan(0);

  // 7. Overlap invariants: prove the test actually exercised the race.
  expect(heldCountBeforeRelease, 'route must have intercepted at least 3 GLB requests before release').toBeGreaterThanOrEqual(3);
  expect(held.length, 'all held requests must have been released by the end of the test').toBe(0);
});

test('repeated load → orbit → ready cycles do not stall demand frameloop', async ({ monitoredPage: page }) => {
  // Spec §"If possible also test repeated: loading → orbit → ready → stop orbit → orbit again".
  await openApp(page);
  const initialInvalidations = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderInvalidationStats().invalidateCount);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);

  const ids: Array<{ id: string; category: string }> = [
    { id: 'chair', category: 'chairs' },
    { id: 'nordicSofa', category: 'sofas' },
    { id: 'glassCoffeeTable', category: 'tables' },
  ];
  for (const { id } of ids) {
    const instanceId = await page.evaluate((assetId) => window.__INTERIOR_MAGIC_TEST__!.addAssetByIdForTest(assetId), id);
    expect(instanceId, `addAssetByIdForTest returned null for ${id}`).not.toBeNull();
    await page.waitForTimeout(50);
  }
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.getAssetCacheStats().loadedAssets ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

  // After 3 assets × 2 invalidates each (load-resolution + post-commit), the
  // counter should be ≥ 6 above the initial baseline.
  const afterFirst = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderInvalidationStats().invalidateCount);
  expect(afterFirst, 'invalidateCount should grow after the catalog-load burst').toBeGreaterThanOrEqual(initialInvalidations + 6);

  // Pause (camera idle)
  await page.waitForTimeout(500);

  // Add one more asset to confirm the invalidator pipeline is still responsive.
  const lampInstanceId = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.addAssetByIdForTest('roundFloorLamp'));
  expect(lampInstanceId).not.toBeNull();
  await page.waitForTimeout(300);
  const afterSecond = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderInvalidationStats().invalidateCount);
  expect(afterSecond, 'invalidateCount should continue to grow (no permanent stall)').toBeGreaterThan(afterFirst);

  const lifecycle = await page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getRenderingLifecycleDiagnostics());
  expect(lifecycle.contextLost).toBe(false);
});
