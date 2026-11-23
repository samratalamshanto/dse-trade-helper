import { test, expect } from './fixtures';

// The new DSE data on the company page: today's trading, the 52-week price history and every other DSE field.
test.describe('/c/GP full DSE data', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/c/GP'); await expect(page.getByRole('heading', { level: 1 })).toContainText(/Grameenphone/i); });
  const tab = (page: import('@playwright/test').Page, n: string) => page.getByRole('tab', { name: n });

  test("overview shows today's open, high, low, volume and trades", async ({ page }) => {
    const panel = page.locator('.panel', { has: page.getByRole('heading', { name: /Today's trading|Last session/ }) });
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
    const days = page.locator('details', { has: page.getByText(/every trading day/) });
    await expect(days.locator('summary')).toHaveText(/^Show every trading day/);
    await days.locator('summary').click();
    await expect(days.locator('summary')).toHaveText(/^Hide every trading day/);
    expect(await days.locator('tbody tr').count()).toBeGreaterThan(200);
    // Close and Change come right after Date, so they are on screen on a phone.
    await expect(days.locator('thead th')).toHaveText(['Date', 'Close', 'Change', 'Open', 'High', 'Low', 'Volume', 'Trades'], { ignoreCase: true });
  });

  test('company details tab shows ISIN, free float and other DSE fields', async ({ page }) => {
    await tab(page, 'Company details').click();
    await expect(page.getByText('BD0001GP0004')).toBeVisible();
    await expect(page.getByText(/Free float/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Company secretary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await expect(page.getByText(/Advanced: raw DSE fields/)).toBeVisible();
    await expect(page.getByText('prevClose')).toBeHidden();
    const links = await page.getByRole('tabpanel').locator('a[href]').all();
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(await a.getAttribute('href')).toMatch(/^(https?:\/\/\S+|tel:\+?\d{5,}|mailto:[\w.+-]+@[\w-]+(\.[\w-]+)+)$/);
  });

  test('company details: phone and email are tappable', async ({ page }) => {
    await tab(page, 'Company details').click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.locator('a[href^="tel:"]').first()).toBeVisible();
    await expect(panel.locator('a[href^="mailto:"]').first()).toBeVisible();
  });

  test('financials, dividends and valuation show the extra DSE tables', async ({ page }) => {
    await tab(page, '5-year financials').click();
    const all = page.locator('details', { has: page.getByText('All yearly figures from DSE (advanced)') });
    await all.locator('summary').click();
    const fields = await all.locator('tbody tr td:first-child').allTextContents();
    expect(new Set(fields).size).toBe(fields.length);
    const yearsHead = (await all.locator('thead th').allTextContents()).slice(1).map(Number);
    expect(yearsHead[0]).toBe(Math.max(...yearsHead));
    await expect(page.getByRole('heading', { name: /All quarterly figures from DSE/ })).toBeVisible();
    await tab(page, 'Dividends').click();
    await expect(page.getByRole('heading', { name: 'Dividend record by year' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Rights' }).first()).toBeVisible();
    await tab(page, 'Price vs own history').click();
    await expect(page.getByRole('heading', { name: 'P/E over the last 30 trading days' })).toBeVisible();
  });
});

test.describe('saved data older than the parser', () => {
  test('the company page says when full details arrive instead of showing empty sections', async ({ page }) => {
    await page.route('**/api/company/GP*', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), dataStale: true } });
    });
    await page.goto('/c/GP');
    await expect(page.getByRole('status').filter({ hasText: 'arrive after the next data refresh' })).toBeVisible();
  });

  test('no note when the saved data is current', async ({ page }) => {
    await page.goto('/c/GP');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Grameenphone/i);
    await expect(page.getByText('arrive after the next data refresh')).toHaveCount(0);
  });
});
