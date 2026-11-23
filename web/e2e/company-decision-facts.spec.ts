import { test, expect } from './fixtures';

// Decision facts on the company page: total return, ease of selling, usual-P/E price band, labelled P/E sources.
test.describe('/c/GP decision facts', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/c/GP'); await expect(page.getByRole('heading', { level: 1 })).toContainText(/Grameenphone/i); });

  test('Overview: ease of selling for ৳1 lakh and the P/E sources labelled', async ({ page }) => {
    const pane = page.getByRole('tabpanel');
    await expect(pane.locator('.fact .k').filter({ hasText: /^How easy to sell/ })).toBeVisible();
    await expect(pane.getByText(/৳1 lakh ≈/)).toBeVisible();
    await expect(pane.getByText(/days of its normal trading/).first()).toBeVisible();
    for (const label of [/^P\/E \(used by the signal\)/, /^DSE P\/E \(audited\)/, /^DSE P\/E \(latest results\)/]) await expect(pane.locator('.fact .k').filter({ hasText: label })).toBeVisible();
  });

  test('Price history: the 1-year change and the change with cash dividends', async ({ page }) => {
    await page.getByRole('tab', { name: 'Price history (52 weeks)' }).click();
    const pane = page.getByRole('tabpanel');
    await expect(pane.getByText('1-year change', { exact: true })).toBeVisible();
    await expect(pane.getByText('1-year change with cash dividends')).toBeVisible();
    await expect(pane.getByText(/৳[\d,.]+ cash a share/)).toBeVisible();
  });

  test('Valuation: price at its usual P/E, never called a value or a goal', async ({ page }) => {
    await page.getByRole('tab', { name: 'Price vs own history' }).click();
    const pane = page.getByRole('tabpanel');
    await expect(pane.getByText('Price at its usual P/E')).toBeVisible();
    for (const k of ['low', 'average', 'high']) await expect(pane.getByText(`Price if P/E were at its year-end ${k}`)).toBeVisible();
    await expect(pane.getByText(/not a forecast/).first()).toBeVisible();
    await expect(pane).not.toContainText(/fair value|target/i);
  });

  test('Plan a buy: the planned shares as days of normal trading, thin trading marked', async ({ page }) => {
    await page.route('**/api/plan/GP?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      code: 'GP', quantity: 1000, price: 703.5, cost: 703500, position52: 0.5, sma20: 700, sma50: 700, vsSma20Pct: 0.5, trend: 'sideways', typicalDailyMovePct: 1,
      moveOdds: [{ pct: 2, within: 5, fell: 20, rose: 20 }], daysCheaperPct: 50, dividend: null, afterBuy: null, warnings: [], reasons: [], sample: 255,
      sellEase: { days: 1.7, thin: true }, action: 'buy-now', label: 'Rules see no reason to wait', tone: 'good', buyNow: 1000, later: 0, alertPrice: null,
      avgPrice: 703.5, commission: 2814, commissionPct: 0.4, totalWithCommission: 706314,
    }) }));
    const p = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Plan a buy' }) });
    await p.getByLabel('How many shares').fill('1000');
    await p.getByRole('button', { name: 'Plan it' }).click();
    await expect(p.getByText(/How easy to sell: 1000 shares \(৳7,03,500\) ≈ 1\.7 days of its normal trading/)).toBeVisible();
    await expect(p.getByText('Thin trading', { exact: true })).toBeVisible();
  });
});
