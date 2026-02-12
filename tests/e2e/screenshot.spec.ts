import { test } from '@playwright/test';

test('desktop screenshot 2560x1440', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/', { waitUntil: 'networkidle' }).catch(async () => {
    // Some dev setups keep long-polling; fall back to a normal load.
    await page.goto('/');
  });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: 'warden-dashboard-2560x1440-latest.png', fullPage: true });
});
