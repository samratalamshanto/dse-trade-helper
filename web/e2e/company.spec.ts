import { test, expect } from './fixtures';

test.describe('/c/GP', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/c/GP'); await expect(page.getByRole('heading', { level: 1 })).toContainText(/Grameenphone/i); });

  test('header price, 52-week bar, key facts', async ({ page }) => {
    await expect(page.locator('.hero-price')).toContainText(/৳\s?\d/);
    await expect(page.getByRole('img', { name: /52-week low ৳.*high ৳.*price ৳/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Key facts' })).toBeVisible();
    await expect(page.getByText('NAV per share').first()).toBeVisible();
    await expect(page.getByLabel('Overview').getByText('Market cap')).toBeVisible();
  });

  test('price range buttons switch', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Price range' });
    for (const r of ['1W', '1M', '3M', '6M', '1Y']) {
      await group.getByRole('button', { name: r, exact: true }).click();
      await expect(group.getByRole('button', { name: r, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
    }
  });

  test('four questions are shown', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Four questions before you buy' })).toBeAttached();
    await expect(page.locator('button.qcard')).toHaveCount(4);
  });

  test('tabs switch, financials show trend cards', async ({ page }) => {
    const tab = (n: string) => page.getByRole('tab', { name: n });
    await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    for (const n of ['Cheap or expensive', 'Dividends', 'News', 'Safety checks', 'Owners']) {
      await tab(n).click();
      await expect(tab(n)).toHaveAttribute('aria-selected', 'true');
      await expect(tab('Overview')).toHaveAttribute('aria-selected', 'false');
    }
    await tab('5-year financials').click();
    await expect(tab('5-year financials')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Audited yearly results')).toBeVisible();
    await expect(page.locator('.trend-grid .kpi')).toHaveCount(7);
    await expect(page.locator('.trend-grid').getByText(/^Net profit/)).toBeVisible();
    await expect(page.locator('.trend-grid').getByText(/^Return on equity \(ROE\)/)).toBeVisible();
  });

  // Chrome logs the 404 document itself as a console error; that is the expected outcome here.
  test.describe('missing', () => {
  test.use({ allowedConsole: [/status of 404/] });
  test('unknown code returns a real 404', async ({ page }) => {
    const res = await page.goto('/c/NOSUCH');
    expect(res?.status()).toBe(404);
  });
  });
});
