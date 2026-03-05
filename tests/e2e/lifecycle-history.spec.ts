import { test, expect } from '@playwright/test';

/**
 * Lifecycle History E2E Tests
 *
 * Tests the Lifecycle tab UI structure in HistoryView:
 * - Tab navigation and visibility
 * - Filter controls (agent ID input, event type dropdown)
 * - Dropdown option values
 * - Empty state or table header rendering
 * - Filter interaction triggering API fetch with correct query params
 *
 * These tests do not require live tmux sessions — they verify UI structure only.
 */

async function navigateToLifecycleTab(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Lifecycle' }).click();
}

test.describe('Lifecycle History', () => {
  test('Lifecycle tab is visible in History view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: 'Lifecycle' })).toBeVisible();
  });

  test('Lifecycle tab renders filter controls', async ({ page }) => {
    await navigateToLifecycleTab(page);

    // Wait for loading to settle
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});

    // Use .first() — mobile accordion duplicates exist in the DOM
    await expect(page.locator('input[placeholder="Filter by agent ID"]').first()).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('Lifecycle tab renders event type options in dropdown', async ({ page }) => {
    await navigateToLifecycleTab(page);

    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});

    const select = page.locator('select').first();
    await expect(select).toBeVisible();

    // Verify the all-events default option is present
    const allOption = select.locator('option').first();
    const allOptionText = await allOption.textContent();
    expect(allOptionText).toMatch(/All/i);

    // Verify specific event type options exist
    await expect(select.locator('option[value="crashed"]')).toHaveCount(1);
    await expect(select.locator('option[value="auto-restarted"]')).toHaveCount(1);
    await expect(select.locator('option[value="idle-timeout"]')).toHaveCount(1);
    await expect(select.locator('option[value="stopped"]')).toHaveCount(1);

    // Confirm the select accepts the 'crashed' value
    await select.selectOption('crashed');
    await expect(select).toHaveValue('crashed');
  });

  test('Lifecycle tab shows table headers or empty state', async ({ page }) => {
    await navigateToLifecycleTab(page);

    // Wait for loading spinner to disappear
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});

    // Either table column headers are visible OR empty state message is shown
    const hasAgentHeader = await page.locator('text=Agent').count() > 0;
    const hasEventTypeHeader = await page.locator('text=Event Type').count() > 0;
    const hasEmptyState = await page.locator('text=No lifecycle events found').count() > 0;

    expect(hasAgentHeader || hasEventTypeHeader || hasEmptyState).toBe(true);
  });

  test('Filtering by agent ID triggers API fetch with agentId query param', async ({ page }) => {
    await navigateToLifecycleTab(page);

    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});

    // Set up waitForResponse BEFORE triggering the filter change
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/lifecycle-events') && response.url().includes('agentId=gideon'),
      { timeout: 5_000 }
    );

    // Type into the agent ID filter input
    const agentIdInput = page.locator('input[placeholder="Filter by agent ID"]').first();
    await agentIdInput.fill('gideon');

    // Await the API call
    const response = await responsePromise;
    expect(response.url()).toContain('agentId=gideon');
  });

  test('Filtering by event type triggers API fetch with eventType query param', async ({ page }) => {
    await navigateToLifecycleTab(page);

    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});

    // Set up waitForResponse BEFORE triggering the filter change
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/lifecycle-events') && response.url().includes('eventType=crashed'),
      { timeout: 5_000 }
    );

    // Select 'crashed' from the event type dropdown
    const select = page.locator('select').first();
    await select.selectOption('crashed');

    // Await the API call
    const response = await responsePromise;
    expect(response.url()).toContain('eventType=crashed');
  });

  test('Lifecycle tab shows pagination controls', async ({ page }) => {
    await navigateToLifecycleTab(page);

    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 10_000 }).catch(() => {});

    // Pagination controls should always be present
    // Use .first() — mobile accordion renders all sections simultaneously in DOM
    await expect(page.getByRole('button', { name: 'Previous' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' }).first()).toBeVisible();
    await expect(page.locator('text=/Page \\d+ of \\d+/').first()).toBeVisible();
  });
});
