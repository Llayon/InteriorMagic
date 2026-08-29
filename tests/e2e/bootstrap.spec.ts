import { expect, test } from '@playwright/test';

test('public editor bootstrap does not depend on Telegram SDK', async ({ page }) => {
  const telegramRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://telegram.org/js/telegram-web-app.js')) telegramRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('app-load-error')).toHaveCount(0);
  expect(telegramRequests).toHaveLength(0);
});
