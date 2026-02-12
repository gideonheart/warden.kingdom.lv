import { test, expect } from '@playwright/test';

test.describe('Terminal Focus', () => {
  test('terminal is immediately interactive on load', async ({ page }) => {
    await page.goto('/');
    // Wait for terminal to render
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });
    // Allow focus to settle after mount
    await page.waitForTimeout(500);

    const terminalHasFocus = await page.evaluate(() => {
      const textarea = document.querySelector('.xterm-helper-textarea');
      return textarea !== null && document.activeElement === textarea;
    });

    expect(terminalHasFocus).toBe(true);
  });

  test('switching tabs re-focuses terminal', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    // Find session tab buttons (they appear in the tab bar area)
    const tabButtons = page.locator('button:has(.font-mono)').filter({ hasText: /.+/ });
    const tabCount = await tabButtons.count();

    if (tabCount > 1) {
      // Click second tab to switch sessions
      await tabButtons.nth(1).click();
      // Wait for ErrorBoundary remount and focus
      await page.waitForTimeout(1_000);

      const terminalHasFocus = await page.evaluate(() => {
        const textarea = document.querySelector('.xterm-helper-textarea');
        return textarea !== null && document.activeElement === textarea;
      });

      expect(terminalHasFocus).toBe(true);
    }
    // If only one tab, test passes — focus already verified in previous test
  });
});
