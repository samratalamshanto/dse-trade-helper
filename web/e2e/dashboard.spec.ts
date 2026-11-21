import { test, expect, isPhone } from './fixtures';

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('loads with index card and signal/quick cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'DSE dashboard' })).toBeAttached();
    await expect(page.getByText('DSEX index')).toBeVisible();
    await expect(page.getByRole('link', { name: /Shortlist/ })).toHaveAttribute('href', '/all?signal=research');
    await expect(page.getByRole('link', { name: /Dividends coming/ })).toHaveAttribute('href', '/dividends');
    await expect(page.getByRole('link', { name: /Fraud alerts/ }).first()).toBeVisible();
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
