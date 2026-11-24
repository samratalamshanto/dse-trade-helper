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
  // The search stays when the tab changes.
  await page.getByRole('tab', { name: /Expected/ }).click();
  await expect(page).toHaveURL(/#expected$/);
  await expect(page.getByText('No company matches the search.')).toBeVisible();
});

test('dividends: section tabs show one table, follow the URL hash and back/forward', async ({ page }) => {
  await page.goto('/dividends');
  const tabs = page.getByRole('tablist', { name: 'Sections' });
  await expect(tabs.getByRole('tab', { name: /Upcoming/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('table.cards')).toHaveCount(1);
  await tabs.getByRole('tab', { name: /Declared/ }).click();
  await expect(page).toHaveURL(/#declared$/);
  await expect(tabs.getByRole('tab', { name: /Declared/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: /Declared in the last 60 days/ })).toBeVisible();
  await expect(page.locator('table.cards')).toHaveCount(1);
  await page.goBack();
  await expect(tabs.getByRole('tab', { name: /Upcoming/ })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/dividends#expected');
  await expect(page.getByRole('heading', { name: 'Expected next announcements' })).toBeVisible();
});

test('dividends: fewer columns, figures in the checks popover, the 30-day filter and the checks sort', async ({ page }, info) => {
  await page.goto('/dividends');
  const upcoming = page.locator('table.cards').first().locator('tbody tr');
  await expect(upcoming.first()).toBeVisible();
  for (const label of ['Dividend', 'Cash / share', '12-month cash yield', 'Last day to buy', 'Record date', 'Dividend checks', 'Score']) {
    await expect(upcoming.first().locator(`td[data-label="${label}"]`)).toHaveCount(1);
  }
  for (const label of ['Price', '৳ per ৳10,000', '52-week position', 'Yield vs usual', 'Paid from profit', 'Paid in']) {
    await expect(upcoming.first().locator(`td[data-label="${label}"]`)).toHaveCount(0);
  }
  // Tapping the checks pill lists the five checks with their figures and does not open the company page.
  const pill = upcoming.first().locator('td.chk-cell .pill-pop > button');
  await expect(pill).toHaveText(/^Passes [0-5] of 5$/);
  await pill.scrollIntoViewIfNeeded();
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  const lines = upcoming.first().locator('td.chk-cell .pop-box li');
  expect(await lines.count()).toBeGreaterThanOrEqual(5);
  await expect(lines.filter({ hasText: /^Price ৳/ })).toHaveCount(1);
  await expect(page).toHaveURL(/\/dividends/);
  await page.keyboard.press('Escape');
  await expect(upcoming.first().locator('td.chk-cell .pop-box')).toHaveCount(0);

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
  // A picked column sorts by that column only: more passes first, warning sign or not.
  const counts = (await upcoming.locator('td.chk-cell .pill-pop > button').allInnerTexts()).map((t) => Number(/Passes (\d)/.exec(t)?.[1]));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  await expect(page.getByText('Companies with no warning sign are listed first.')).toHaveCount(0);
  if (!isPhone(info.project.name)) {
    await page.getByRole('button', { name: 'Score', exact: true }).click();
    await expect(page.locator('th[data-sort="score"]')).toHaveAttribute('aria-sort', 'descending');
    const scores = (await upcoming.locator('td[data-label="Score"] .mono').allInnerTexts()).map(Number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  }
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
