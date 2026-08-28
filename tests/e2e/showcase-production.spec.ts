import { expect, test } from '@playwright/test';

const ids = ['carpet', 'chair', 'coffee_table_026', 'dresser_001', 'electronics', 'lamp', 'sofa_030'];

test('production showcase uses only the immutable public M1A delivery', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/?showcase=1');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-instance-count', '8', { timeout: 20_000 });
  await expect.poll(() => requests.filter((url) => /\/showcase\/v1\/models\/[^/]+\.glb$/.test(new URL(url).pathname)).length, { timeout: 20_000 }).toBe(7);
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-sheet-state', /peek|expanded|closed/);
  expect(requests.some((url) => url.includes('/__m1a_assets__/'))).toBe(false);
  const modelRequests = requests.filter((url) => /\/showcase\/v1\/models\/[^/]+\.glb$/.test(new URL(url).pathname));
  expect(modelRequests.map((url) => new URL(url).pathname.split('/').at(-1)!.replace('.glb', '')).sort()).toEqual(ids.slice().sort());
  expect(new Set(modelRequests).size).toBe(7);
  expect(requests.some((url) => /catalog\/v1|runtime-catalog|catalog-payload/.test(url))).toBe(false);
});

test('production without showcase remains ordinary and requests no M1A assets', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByTestId('app-root')).toHaveAttribute('data-instance-count', /\d+/, { timeout: 20_000 });
  expect(requests.some((url) => url.includes('/showcase/v1/'))).toBe(false);
  expect(requests.some((url) => url.includes('/__m1a_assets__/'))).toBe(false);
});
