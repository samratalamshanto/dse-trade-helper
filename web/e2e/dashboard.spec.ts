import { test, expect, isPhone } from './fixtures';

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('loads with index card and signal/quick cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'DSE dashboard' })).toBeAttached();
    await expect(page.getByText('DSEX index')).toBeVisible();
    await expect(page.getByRole('link', { name: /Shortlist/ })).toHaveAttribute('href', '/all?signal=research');
    await expect(page.getByRole('link', { name: /Dividends coming/ })).toHaveAttribute('href', '/dividends');
    await expect(page.getByRole('link', { name: /Warning signs/ }).first()).toBeVisible();
  });

  test('signal slices on the doughnut link to /all?signal=', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /companies by signal/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See the whole shortlist →' })).toHaveAttribute('href', '/all?signal=research');
    await page.getByRole('link', { name: /Shortlist/ }).click();
    await expect(page).toHaveURL(/\/all\?signal=research/);
    await expect(page.getByLabel('Signal', { exact: true })).toHaveValue('research');
  });

  test('movers heading is Today\'s or Last session\'s', async ({ page }) => {
    await expect(page.getByText(/^(Top gainers today|Last session's top gainers)$/)).toBeVisible();
    await expect(page.getByText(/^(Top losers today|Last session's top losers)$/)).toBeVisible();
  });

  test('no horizontal overflow on phone', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name));
    await expect(page.getByText('DSEX index')).toBeVisible();
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);
  });

  test('sidebar scrolls to its last link on a short laptop window', async ({ page }, info) => {
    test.skip(isPhone(info.project.name));
    await page.setViewportSize({ width: 1280, height: 640 });
    const last = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Start investing' });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  test('company tabs switch between list, sectors and dividends', async ({ page }) => {
    await page.goto('/sectors');
    const tabs = page.getByRole('navigation', { name: 'Companies' });
    await expect(tabs.getByRole('link', { name: 'Sectors' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Dividends' }).click();
    await expect(page).toHaveURL(/\/dividends$/);
  });

  test('switching back to a tab shows its data at once, with no new API call', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/sectors');
    const tabs = page.getByRole('navigation', { name: 'Companies' });
    await expect(page.locator('.sector-card').first()).toBeVisible();
    await tabs.getByRole('link', { name: 'Dividends' }).click();
    await expect(page.getByRole('heading', { name: 'Upcoming record dates' })).toBeVisible();
    // Outlast the 5 s in-flight reuse window, so only the answer cache can explain a missing request.
    await page.waitForTimeout(5_500);
    const calls: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/')) calls.push(r.url()); });
    await tabs.getByRole('link', { name: 'Sectors' }).click();
    await expect(page.locator('.sector-card').first()).toBeVisible();
    await expect(page.locator('.skel-block')).toHaveCount(0);
    await tabs.getByRole('link', { name: 'Dividends' }).click();
    await expect(page.getByRole('heading', { name: 'Upcoming record dates' })).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('Warning signs menu item counts flagged stocks in the watchlist', async ({ page }, info) => {
    const body = await (await page.request.get('/api/companies')).json() as { rows: { code: string; fraud: string; category: string }[] };
    const flagged = body.rows.find((r) => r.fraud !== 'clean' && r.category !== 'Z')!.code;
    const clean = body.rows.find((r) => r.fraud === 'clean')!.code;
    await page.goto('/');
    await page.evaluate((list) => localStorage.setItem('watchlist', JSON.stringify(list)), [flagged, clean]);
    await page.reload();
    if (isPhone(info.project.name)) await page.getByRole('button', { name: /^Menu/ }).click();
    await expect(page.getByRole('link', { name: 'Warning signs 1 of your watchlist flagged' })).toBeVisible();
  });

  test('a panel that starts without a path still shows the data another part already loaded', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('watchlist'));
    await page.reload();
    await expect(page.getByText(/DSEX index/)).toBeVisible();
    // The top bar has loaded /api/companies; adding a stock now makes My stocks switch from no path to that cached path.
    await page.evaluate(() => { localStorage.setItem('watchlist', '["GP"]'); dispatchEvent(new Event('stored-value-change')); });
    await expect(page.locator('.my-stocks')).toContainText(/GP\s*৳\d/);
  });

  test('dashboard shows the market first, before the personal panels', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('watchlist', '["GP"]'));
    await page.reload();
    await expect(page.locator('.my-stocks')).toContainText(/GP\s*৳\d/);
    const order = await page.locator('main section.market, main section.my-stocks').evaluateAll((els) => els.map((e) => e.className));
    expect(order[0]).toContain('market');
  });

  test('title and tabs stay on screen while the data loads', async ({ page }) => {
    await page.route('**/api/dividends', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    await page.goto('/dividends');
    await expect(page.locator('.skel-block')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Companies' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('phone menu button opens the nav', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name));
    const menu = page.getByRole('button', { name: /^Menu/ });
    await menu.click();
    await expect(menu).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Companies' })).toBeVisible();
    await nav.getByRole('link', { name: 'Companies' }).click();
    await expect(page).toHaveURL(/\/all$/);
  });
});
