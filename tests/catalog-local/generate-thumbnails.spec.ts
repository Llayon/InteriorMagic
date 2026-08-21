import { expect, test } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prototypeIds } from './fixtures';

test('generates the local prototype thumbnail set offline', async ({ browser }) => {
  test.setTimeout(120_000);
  const outputDirectory = path.resolve('public/.local-assets/ithappy-registry/thumbnails');
  const evidenceDirectory = path.resolve('visual-evidence');
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(evidenceDirectory, { recursive: true });
  const sizes: number[] = [];

  for (const assetId of prototypeIds) {
    const page = await browser.newPage({ viewport: { width: 256, height: 192 }, deviceScaleFactor: 1 });
    await page.goto(`/?registry=ithappy&thumbnail=ithappy&asset=${encodeURIComponent(assetId)}`);
    await expect(page.getByTestId('thumbnail-renderer')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const dataUrl = await page.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/webp', .82));
    expect(dataUrl.startsWith('data:image/webp;base64,')).toBe(true);
    const outputPath = path.join(outputDirectory, `${assetId}.webp`);
    await writeFile(outputPath, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
    sizes.push((await stat(outputPath)).size);
    await page.close();
  }

  const sorted = [...sizes].sort((a, b) => a - b);
  const report = {
    generatedCount: sizes.length, format: 'WebP', width: 256, height: 192, prototypeQuality: .82,
    totalBytes: sizes.reduce((sum, size) => sum + size, 0), medianBytes: sorted[Math.floor(sorted.length / 2)],
    p90Bytes: sorted[Math.ceil(sorted.length * .9) - 1], maxBytes: sorted.at(-1),
  };
  expect(report.generatedCount).toBe(24);
  await writeFile(path.join(evidenceDirectory, 'ithappy-thumbnail-report.json'), JSON.stringify(report, null, 2));
});
