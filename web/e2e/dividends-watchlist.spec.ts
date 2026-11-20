import { test, expect } from './fixtures';

test('dividends: past rows hidden by default, show-past reveals more', async ({ page }) => {
  await page.goto('/dividends');
  const box = page.getByRole('checkbox', { name: /Show rows where the last day to buy has passed/ });
  await expect(box).toBeVisible();
  const label = await page.locator('label.check').innerText();
  const pastCount = Number(/\((\d+)\)/.exec(label)?.[1]);
  const upcoming = page.locator('table.cards').first().locator('tbody tr');
  await expect(upcoming.first()).toBeVisible();
  const before = await upcoming.count();
  await expect(box).not.toBeChecked();
  await box.check();
  if (pastCount > 0) await expect(upcoming).toHaveCount(before + pastCount);
  else await expect(upcoming).toHaveCount(before);
  await box.uncheck();
  await expect(upcoming).toHaveCount(before);
});

test('watchlist: add from company page, shows, persists, remove', async ({ page }) => {
  await page.goto('/c/GP');
  await page.getByRole('button', { name: 'Save to watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Saved to watchlist' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/watchlist');
  const row = page.locator('table.cards tbody tr', { hasText: 'GP' });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Remove GP from watchlist' }).click();
  await expect(page.getByText('Your watchlist is empty.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your watchlist is empty.')).toBeVisible();
});
