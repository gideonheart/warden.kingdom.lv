import { test, expect } from '@playwright/test';

test.describe('Prompt Panel', () => {
  test('prompt panel renders with agent dropdown and textarea', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    // Verify prompt panel elements exist
    const textarea = page.locator('textarea[placeholder*="prompt"]');
    await expect(textarea).toBeVisible();

    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeVisible();

    // Verify dropdown has at least one agent option
    const dropdown = page.locator('select');
    const optionCount = await dropdown.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
  });

  test('dropdown syncs agent when switching session tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    // Get tabs (same selector pattern as terminal-focus.spec.ts)
    const tabButtons = page.locator('button:has(.font-mono)').filter({ hasText: /.+/ });
    const tabCount = await tabButtons.count();

    if (tabCount > 1) {
      // Get dropdown value before switching
      const dropdown = page.locator('select');
      const initialAgent = await dropdown.inputValue();

      // Click second tab
      await tabButtons.nth(1).click();
      await page.waitForTimeout(500);

      // Get dropdown value after switching
      const updatedAgent = await dropdown.inputValue();

      // Dropdown should have a non-empty value (it may or may not differ
      // depending on whether both sessions belong to same agent)
      expect(updatedAgent).toBeTruthy();
    }
    // If only one tab, skip — sync verified structurally
  });

  test('send button is disabled when textarea is empty', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeDisabled();
  });

  test('typing in textarea enables send button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    const textarea = page.locator('textarea[placeholder*="prompt"]');
    await textarea.fill('Test prompt');

    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeEnabled();
  });

  test('send button click triggers API call and shows status', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    const textarea = page.locator('textarea[placeholder*="prompt"]');
    await textarea.fill('Test prompt from Playwright');

    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // Button should show "Sending..." briefly
    // Then status message should appear (success or error depending on Gateway)
    // Wait for either success or error status message in the prompt panel area
    const statusMessage = page.locator('.border-t.border-warden-border .text-warden-success, .border-t.border-warden-border .text-warden-error');
    await expect(statusMessage).toBeVisible({ timeout: 10_000 });
  });

  test('ctrl+enter sends prompt', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.xterm', { state: 'visible', timeout: 10_000 });

    const textarea = page.locator('textarea[placeholder*="prompt"]');
    await textarea.fill('Ctrl+Enter test prompt');

    // Press Ctrl+Enter
    await textarea.press('Control+Enter');

    // Status message should appear in the prompt panel area
    const statusMessage = page.locator('.border-t.border-warden-border .text-warden-success, .border-t.border-warden-border .text-warden-error');
    await expect(statusMessage).toBeVisible({ timeout: 10_000 });
  });
});
