import { test, expect } from './fixtures';

// The auto "guard" fixture fails each test on any console error / pageerror.
const ROUTES = ['/', '/all', '/sectors', '/compare?codes=GP,BRACBANK', '/dividends', '/fraud', '/watchlist', '/portfolio', '/alerts', '/learn', '/plan', '/c/GP'];

for (const path of ROUTES) {
  test(`no console errors on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading').first()).toBeAttached();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/^Could not load/)).toHaveCount(0);
  });
}

test('no console errors on /trades key prompt (no API call)', async ({ page }) => {
  await page.route('**/api/trades**', (r) => r.abort());
  await page.goto('/trades');
  await expect(page.getByLabel('Trades key')).toBeVisible();
});
