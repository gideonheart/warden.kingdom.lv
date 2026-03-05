import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads and displays header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Warden');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('shows active session count badge', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/\\d+ active/')).toBeVisible();
  });

  test('displays navigation buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Terminals' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agents' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  test('shows empty state when no sessions', async ({ page }) => {
    await page.goto('/');
    // Wait for loading to complete
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});
    // Either shows terminal or empty state
    const hasTerminal = await page.locator('.xterm').count() > 0;
    const hasEmptyState = await page.locator('text=No active agent sessions').count() > 0;
    expect(hasTerminal || hasEmptyState).toBe(true);
  });
});

test.describe('View Navigation', () => {
  test('switches to history view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lifecycle' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Token Usage' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gateway Logs' })).toBeVisible();
  });

  test('switches back to terminals view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Terminals' }).click();
    // Tab bar should be visible (even if empty)
    await expect(page.locator('text=/No active sessions|active/')).toBeVisible();
  });

  test('toggles agent sidebar', async ({ page }) => {
    await page.goto('/');
    const agentsButton = page.getByRole('button', { name: 'Agents' });
    // Click to toggle off
    await agentsButton.click();
    // Click to toggle on
    await agentsButton.click();
  });
});

test.describe('History View', () => {
  test('activity view is default tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    // Activity tab should be active by default — export buttons visible
    await expect(page.getByRole('button', { name: 'CSV' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'JSON' }).first()).toBeVisible();
  });

  test('session history displays filter controls', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Sessions' }).click();
    // Use .first() — mobile accordion duplicates exist in DOM but are hidden via sm:hidden
    await expect(page.locator('input[placeholder="Agent ID"]').first()).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('token usage view loads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Token Usage' }).click();
    await expect(page.locator('input[placeholder="Filter by agent ID"]').first()).toBeVisible();
  });

  test('log viewer loads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Gateway Logs' }).click();
    await expect(page.locator('input[placeholder="Filter by agent ID"]').first()).toBeVisible();
    await expect(page.locator('text=Auto-refresh').first()).toBeVisible();
  });
});

test.describe('Tab Bar', () => {
  test('tab bar is present on terminals view', async ({ page }) => {
    await page.goto('/');
    // The tab bar should render (showing either session tabs or "No active sessions")
    await page.waitForTimeout(2_000);
    const tabBarContent = await page.locator('text=/No active sessions|active/').count();
    expect(tabBarContent).toBeGreaterThan(0);
  });
});
