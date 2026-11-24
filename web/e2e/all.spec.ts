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

  test('phone: the selects stay folded until Filters is pressed', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'the Filters button shows only at phone width');
    await expect(page.getByLabel('Signal', { exact: true })).toBeHidden();
    // The company search sits in the same grid but stays visible while the selects are folded.
    await expect(page.getByRole('combobox', { name: 'Pick a company' })).toBeVisible();
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByLabel('Signal', { exact: true })).toBeVisible();
  });

  test('the warning-sign select is gone, but an old ?fraud= link still filters and Clear filters drops it', async ({ page }) => {
    await expect(page.locator('#f-fraud')).toHaveCount(0);
    await expect(page.locator('#all-filters').getByRole('combobox', { name: 'Pick a company' })).toHaveCount(1);
    await page.goto('/all?fraud=high');
    await expect(page.getByText(/Showing \d+ companies/)).toBeVisible();
    for (const t of await rows(page).locator('td[data-label="Warnings"]').allInnerTexts()) expect(t).not.toMatch(/No flags/);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/fraud=/);
  });

  test('signal filter narrows the list', async ({ page }, info) => {
    const all = await rows(page).count();
    if (info.project.name === 'phone') await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByLabel('Signal', { exact: true }).selectOption('research');
    await expect(page).toHaveURL(/signal=research/);
    await expect(page.getByText(/Showing \d+ companies/)).toBeVisible();
    const n = await rows(page).count();
    expect(n).toBeLessThan(all);
    if (n > 0 && !(await page.getByText('No company matches these filters.').count())) {
      for (const t of await rows(page).locator('td[data-label="Signal"]').allInnerTexts()) expect(t).toMatch(/Passes the checks/i);
    }
  });

  test('sort by P/E ascending', async ({ page }, info) => {
    // At phone width table.cards hides <thead>; the card layout has its own sort select.
    if (info.project.name === 'phone') await page.getByRole('combobox', { name: 'Sort by' }).selectOption('pe');
    else await page.getByRole('button', { name: 'P/E ↕', exact: true }).click();
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
    const chip = page.getByRole('group', { name: 'Quick picks:' }).getByRole('button', { name: 'High-risk list' });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect(page).toHaveURL(/preset=avoid/);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toHaveClass(/active/);
  });

  test('"Passes the checks" lists only research-signal rows at any price, more than "Low P/E vs sector"', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Quick picks:' });
    const cheapChip = group.getByRole('button', { name: 'Low P/E vs sector' });
    await cheapChip.click();
    await expect(cheapChip).toHaveAttribute('aria-pressed', 'true');
    const cheap = await rows(page).count();
    const goodChip = group.getByRole('button', { name: 'Passes the checks' });
    await goodChip.click();
    await expect(goodChip).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/preset=good/);
    const good = await rows(page).count();
    expect(good).toBeGreaterThanOrEqual(cheap);
    expect(good).toBeGreaterThan(0);
    const signals = await rows(page).locator('td[data-label=Signal]').allInnerTexts();
    for (const s of signals) expect(s).toContain('Passes the checks');
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

test('/all: the watch star is vertically centred in its row, level with the signal badge, also when the name wraps', async ({ page }) => {
  await page.goto('/all');
  await expect(rows(page).first()).toContainText('৳');
  const offsets = await rows(page).evaluateAll((trs) => trs.filter((tr) => tr.querySelector('.watch-btn')).slice(0, 15).map((tr) => {
    const star = tr.querySelector('.watch-btn')!.getBoundingClientRect();
    const cell = tr.querySelector('td')!.getBoundingClientRect();
    return { code: tr.querySelector('b')?.textContent, gapDiff: Math.abs((star.top - cell.top) - (cell.bottom - star.bottom)) };
  }));
  expect(offsets.length).toBeGreaterThan(0);
  for (const o of offsets) expect(o.gapDiff, `${o.code}: space above and below the star differs`).toBeLessThanOrEqual(2);
});
