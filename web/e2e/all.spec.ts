import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

const rows = (page: import('@playwright/test').Page) => page.locator('table.cards tbody tr');

test.describe('/all', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/all');
    await expect(rows(page).first()).toContainText('৳');
  });

  test('search GP finds Grameenphone', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Search company' }).fill('GP');
    await expect(page.getByRole('option', { name: /Grameenphone/i }).first()).toBeVisible();
  });

  test('signal filter narrows the list', async ({ page }) => {
    const all = await rows(page).count();
    await page.getByLabel('Signal', { exact: true }).selectOption('research');
    await expect(page).toHaveURL(/signal=research/);
    await expect(page.getByText(/Showing \d+ companies/)).toBeVisible();
    const n = await rows(page).count();
    expect(n).toBeLessThan(all);
    if (n > 0 && !(await page.getByText('No company matches these filters.').count())) {
      for (const t of await rows(page).locator('td[data-label="Signal"]').allInnerTexts()) expect(t).toMatch(/Worth researching/i);
    }
  });

  test('sort by P/E ascending', async ({ page }, info) => {
    // At phone width table.cards hides <thead>; the card layout has its own sort select.
    if (info.project.name === 'phone') await page.getByRole('combobox', { name: 'Sort by' }).selectOption('pe');
    else await page.getByRole('button', { name: 'P/E' }).click();
    await expect(page).toHaveURL(/sort=pe&dir=1/);
    await expect(page.locator('th[data-sort="pe"]')).toHaveAttribute('aria-sort', 'ascending');
    const vals = (await rows(page).locator('td[data-label="P/E"]').allInnerTexts())
      .map((s) => Number(s.replace(/,/g, ''))).filter((n) => Number.isFinite(n));
    expect(vals.length).toBeGreaterThan(5);
    expect(vals).toEqual([...vals].sort((a, b) => a - b));
  });

  test('phone: sort direction button flips the order', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'the card sort control shows only at phone width');
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('pe');
    await page.getByRole('button', { name: 'Low to high' }).click();
    await expect(page).toHaveURL(/\/all\?sort=pe$/); // dir=-1 is the default, so the URL drops it
    await expect(page.getByRole('button', { name: 'High to low' })).toBeVisible();
  });

  test('quick pick chip shows its active state and filters by URL', async ({ page }) => {
    const chip = page.getByRole('group', { name: 'Quick picks:' }).getByRole('button', { name: 'Risky — avoid' });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect(page).toHaveURL(/preset=avoid/);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toHaveClass(/active/);
  });

  test('CSV download has a header row', async ({ page }) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download list/ }).click()]);
    expect(dl.suggestedFilename()).toBe('dse-companies.csv');
    const text = await readFile((await dl.path())!, 'utf8');
    expect(text.split('\n')[0]).toBe('code,name,sector,category,signal,score,fraud,price,pe,dividend_yield_pct,traded_per_day_bdt,change_1y_pct,old_data');
    expect(text.split('\n').length).toBeGreaterThan(10);
  });
});

test('/all asks for /api/companies once on load', async ({ page }) => {
  let n = 0;
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/companies') n++; });
  await page.goto('/all');
  await expect(rows(page).first()).toContainText('৳');
  await page.waitForLoadState('networkidle');
  expect(n).toBe(1);
});
