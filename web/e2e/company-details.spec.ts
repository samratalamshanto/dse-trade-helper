import { test, expect } from './fixtures';

// The new DSE data on the company page: today's trading, the 52-week price history and every other DSE field.
test.describe('/c/GP full DSE data', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/c/GP'); await expect(page.getByRole('heading', { level: 1 })).toContainText(/Grameenphone/i); });
  const tab = (page: import('@playwright/test').Page, n: string) => page.getByRole('tab', { name: n });

  test("overview shows today's open, high, low, volume and trades", async ({ page }) => {
    const panel = page.locator('.panel', { has: page.getByRole('heading', { name: /Today's trading/ }) });
    await expect(panel).toBeVisible();
    for (const k of ['Open', 'High', 'Low', 'Volume (shares)', 'Trades']) await expect(panel.getByText(k, { exact: true })).toBeVisible();
    await expect(panel).toContainText(/৳\s?\d/);
  });

  test('price history tab: summary, band chart, swings, months and every day', async ({ page }) => {
    await tab(page, 'Price history (52 weeks)').click();
    await expect(tab(page, 'Price history (52 weeks)')).toHaveAttribute('aria-selected', 'true');
    for (const h of ['The last 52 weeks in short', "Daily close and the day's high–low band", 'When it rose and fell', 'Month by month']) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
    await expect(page.getByRole('img').filter({ has: page.locator('canvas') }).or(page.locator('canvas[aria-label]')).first()).toBeVisible();
    const days = page.locator('details', { has: page.getByText(/Every trading day/) });
    await days.locator('summary').click();
    expect(await days.locator('tbody tr').count()).toBeGreaterThan(200);
  });

  test('company details tab shows ISIN, free float and other DSE fields', async ({ page }) => {
    await tab(page, 'Company details').click();
    await expect(page.getByText('BD0001GP0004')).toBeVisible();
    await expect(page.getByText(/Free float/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Company secretary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Other fields from DSE' })).toBeVisible();
    for (const a of await page.getByRole('tabpanel').locator('a[href]').all()) expect(await a.getAttribute('href')).toMatch(/^https?:\/\//);
  });

  test('financials, dividends and valuation show the extra DSE tables', async ({ page }) => {
    await tab(page, '5-year financials').click();
    await expect(page.getByRole('heading', { name: 'All yearly figures from DSE' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /All quarterly figures from DSE/ })).toBeVisible();
    await tab(page, 'Dividends').click();
    await expect(page.getByRole('heading', { name: 'DSE dividend history' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Rights' }).first()).toBeVisible();
    await tab(page, 'Cheap or expensive').click();
    await expect(page.getByRole('heading', { name: 'P/E over the last 30 trading days' })).toBeVisible();
  });
});
