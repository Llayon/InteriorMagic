import { expect, type CDPSession, type Page } from '@playwright/test';

export type Point = { x: number; y: number };

export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-root')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__INTERIOR_MAGIC_TEST__?.isReady()), { timeout: 15_000 }).toBe(true);
}

export async function project(page: Page) {
  return page.evaluate(() => window.__INTERIOR_MAGIC_TEST__!.getProject());
}

export async function addAsset(page: Page, category: string, assetId: string) {
  const before = (await project(page)).objects.length;
  await page.getByRole('button', { name: `Category ${category}` }).click();
  await page.locator(`[data-asset-id="${assetId}"]`).click();
  await expect.poll(async () => (await project(page)).objects.length).toBe(before + 1);
  return (await project(page)).objects.at(-1)!;
}

export async function proxyBounds(page: Page, instanceId: string) {
  const bounds = await page.evaluate((id) => window.__INTERIOR_MAGIC_TEST__!.getInteractionProxyScreenBounds(id), instanceId);
  expect(bounds).not.toBeNull();
  return bounds!;
}

export async function drag(page: Page, from: Point, to: Point, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export class TouchGesture {
  private constructor(private readonly session: CDPSession, private current: Point) {}

  static async start(page: Page, point: Point) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [TouchGesture.touchPoint(point)] });
    return new TouchGesture(session, point);
  }

  async move(to: Point, steps = 1) {
    const from = this.current;
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      await this.session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [TouchGesture.touchPoint(point)] });
    }
    this.current = to;
  }

  async end() { await this.finish('touchEnd'); }
  async cancel() { await this.finish('touchCancel'); }

  private async finish(type: 'touchEnd' | 'touchCancel') {
    await this.session.send('Input.dispatchTouchEvent', { type, touchPoints: [] });
    await this.session.detach();
  }

  private static touchPoint(point: Point) {
    return { x: point.x, y: point.y, id: 1, radiusX: 8, radiusY: 8, force: 1 };
  }
}
