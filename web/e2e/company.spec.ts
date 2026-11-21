import { test, expect } from './fixtures';

test.describe('/c/GP', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/c/GP'); await expect(page.getByRole('heading', { level: 1 })).toContainText(/Grameenphone/i); });

  test('header price, 52-week bar, key facts', async ({ page }) => {
    await expect(page.locator('.hero-price')).toContainText(/৳\s?\d/);
    await expect(page.getByRole('img', { name: /52-week low ৳.*high ৳.*price ৳/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Key facts' })).toBeVisible();
    await expect(page.getByText('NAV per share').first()).toBeVisible();
    await expect(page.getByLabel('Overview').getByText('Market cap', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Overview').getByText(/^Free float/)).toBeVisible();
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

  test('tab strip: one row, scrolls, active tab stays visible', async ({ page }) => {
    const strip = page.getByRole('tablist', { name: 'Company details' });
    const box = await strip.boundingBox();
    expect(box!.height).toBeLessThan(70);
    const last = page.getByRole('tab', { name: 'Company details' });
    await last.click();
    await expect(last).toHaveAttribute('aria-selected', 'true');
    await expect(last).toBeInViewport();
    const s = await strip.evaluate((el) => ({ w: el.scrollWidth, c: el.clientWidth, left: el.scrollLeft }));
    if (s.w > s.c) expect(s.left).toBeGreaterThan(0);
    await last.press('Home');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  test('no horizontal page overflow on any tab', async ({ page }) => {
    for (const t of await page.getByRole('tab').all()) {
      await t.click();
      await expect(t).toHaveAttribute('aria-selected', 'true');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `overflow on tab ${await t.textContent()}`).toBeLessThanOrEqual(0);
    }
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
