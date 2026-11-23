import { test, expect, isPhone } from './fixtures';

test('dividends: past rows hidden by default, show-past reveals more', async ({ page }) => {
  await page.goto('/dividends');
  const box = page.getByRole('checkbox', { name: /Show rows where the last day to buy has passed/ });
  await expect(box).toBeVisible();
  const label = await page.locator('label.check', { hasText: 'Show rows where the last day to buy has passed' }).innerText();
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

test('dividends: value columns, the checks popover, the 30-day filter and the checks sort', async ({ page }, info) => {
  await page.goto('/dividends');
  const upcoming = page.locator('table.cards').first().locator('tbody tr');
  await expect(upcoming.first()).toBeVisible();
  for (const label of ['৳ per ৳10,000', '52-week position', 'Yield vs usual', 'Paid from profit', 'Paid in', 'Dividend checks', 'Score']) {
    await expect(upcoming.first().locator(`td[data-label="${label}"]`)).toHaveCount(1);
  }
  // Every table has the checks pill; tapping it lists the five checks and does not open the company page.
  for (const table of await page.locator('table.cards').all()) await expect(table.locator('.chk-pop').first()).toBeVisible();
  const pill = upcoming.first().locator('.chk-pop > button');
  await expect(pill).toHaveText(/^Passes [0-5] of 5$/);
  await pill.scrollIntoViewIfNeeded();
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(upcoming.first().locator('.chk-list li')).toHaveCount(5);
  await expect(page).toHaveURL(/\/dividends/);
  await page.keyboard.press('Escape');
  await expect(upcoming.first().locator('.chk-list')).toHaveCount(0);

  const all = await upcoming.count();
  await page.getByRole('checkbox', { name: 'Record date within 30 days' }).check();
  // Every row left says its record date is today or within 30 days.
  for (const t of await upcoming.locator('td[data-label="Record date"]').allInnerTexts()) {
    const n = /record date today/.test(t) ? 0 : Number(/in (\d+) days?/.exec(t)?.[1]);
    expect(n).toBeLessThanOrEqual(30);
  }
  expect(await upcoming.count()).toBeLessThanOrEqual(all);

  // Phones hide the header, so they sort with the card control.
  if (isPhone(info.project.name)) {
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('checks');
    await expect(page.getByRole('button', { name: 'High to low' })).toBeVisible();
  } else {
    await page.getByRole('button', { name: 'Dividend checks' }).click();
    await expect(page.locator('th[data-sort="checks"]')).toHaveAttribute('aria-sort', 'descending');
  }
  // Rows without a warning sign stay first; inside that group more passes come first.
  const counts = (await upcoming.locator('.chk-pop > button').allInnerTexts()).map((t) => Number(/Passes (\d)/.exec(t)?.[1]));
  const flagged = await upcoming.evaluateAll((rows) => rows.map((r) => !!r.querySelector('td:first-child .pill')));
  const clean = counts.filter((_, i) => !flagged[i]);
  expect(clean).toEqual([...clean].sort((a, b) => b - a));
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
