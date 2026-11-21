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

test('dividends: the search box narrows every table to the typed company', async ({ page }) => {
  await page.goto('/dividends');
  const upcoming = page.locator('table.cards').first().locator('tbody tr');
  await expect(upcoming.first()).toBeVisible();
  const code = (await upcoming.first().locator('td b.mono').innerText()).trim();
  await page.getByRole('searchbox', { name: 'Find a company (code or name)' }).fill(code);
  for (const t of await upcoming.locator('td b.mono').allInnerTexts()) expect(t).toContain(code);
  await page.getByRole('searchbox', { name: 'Find a company (code or name)' }).fill('zzzz-no-such');
  await expect(page.getByText('No company matches the search.')).toBeVisible();
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /Expected/ }).click();
  await expect(page).toHaveURL(/#expected$/);
});

test('sectors: the search box keeps only matching sectors', async ({ page }) => {
  await page.goto('/sectors');
  await expect(page.locator('.sector-card').first()).toBeVisible();
  const all = await page.locator('.sector-card').count();
  await page.getByRole('searchbox', { name: 'Find a sector or company' }).fill('bank');
  await expect(page.locator('.sector-card')).not.toHaveCount(all);
  // A card matches by its sector name, or names the matching company on a "Has" line.
  for (const t of await page.locator('.sector-card').allInnerTexts()) expect(t).toMatch(/bank|Has/i);
  await page.getByRole('searchbox', { name: 'Find a sector or company' }).fill('GP');
  await expect(page.locator('.sector-card').filter({ hasText: 'Has' }).first()).toBeVisible();
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
