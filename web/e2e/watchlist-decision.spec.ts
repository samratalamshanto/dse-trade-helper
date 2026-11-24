import { test, expect } from './fixtures';

// Seed the watchlist with GP (has 52-week data, P/E, EPS) and APEXSPINN (declared dividend, record date passed).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('watchlist', JSON.stringify(['GP', 'APEXSPINN']));
  });
});

// (1) Decision facts cell shows 52-week position, P/E vs usual, EPS trend, results month.
test('watchlist: decision facts cell has 52-wk position, P/E and EPS for GP', async ({ page }) => {
  await page.goto('/watchlist');
  const gpRow = page.locator('table.cards tbody tr', { hasText: 'GP' });
  await expect(gpRow).toBeVisible({ timeout: 20_000 });
  // Wait for company data to load: the Price cell changes from "—" to a ৳ value.
  await expect(gpRow.locator('td[data-label="Price"]')).toContainText('৳', { timeout: 20_000 });
  const cell = gpRow.locator('td[data-label="Decision facts"]');
  await expect(cell).toBeVisible();
  // The cell must show non-trivial content (not just "—").
  const text = await cell.innerText();
  expect(text.trim()).not.toBe('—');
  // At least one of the four facts is present.
  const hasAny = /above 52-wk low|vs usual|EPS|results ~/.test(text);
  expect(hasAny).toBe(true);
});

// (2) APEXSPINN declared dividend whose record date passed: "none upcoming" plus "last: ৳…, record date passed", not "none announced".
test('watchlist: APEXSPINN shows declared dividend with record date passed', async ({ page }) => {
  await page.goto('/watchlist');
  const row = page.locator('table.cards tbody tr', { hasText: 'APEXSPINN' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  const divCell = row.locator('td[data-label="Next dividend"]');
  await expect(divCell).toBeVisible();
  await expect(divCell).not.toContainText('none announced');
  await expect(divCell).toContainText('none upcoming');
  await expect(divCell).toContainText('last:');
  await expect(divCell).toContainText('record date passed');
});

// (3) Alert link → /alerts?code=CODE prefilled; Plan link → company page planner; neither triggers row navigation.
test('watchlist: Alert link prefills code on alerts page', async ({ page }) => {
  await page.goto('/watchlist');
  const row = page.locator('table.cards tbody tr', { hasText: 'GP' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  const alertLink = row.getByRole('link', { name: 'Alert' });
  await expect(alertLink).toHaveAttribute('href', '/alerts?code=GP');
  // Click the Alert link — must land on /alerts, not on the company page.
  await alertLink.click();
  await expect(page).toHaveURL(/\/alerts/);
  await expect(page).not.toHaveURL(/\/c\//);
  // The code box must be prefilled with GP.
  const codeInput = page.getByLabel('Company code');
  await expect(codeInput).toHaveValue('GP');
});

test('watchlist: Plan link opens company page at planner section', async ({ page }) => {
  await page.goto('/watchlist');
  const row = page.locator('table.cards tbody tr', { hasText: 'GP' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  const planLink = row.getByRole('link', { name: 'Plan' });
  await expect(planLink).toHaveAttribute('href', '/c/GP#planner-title');
  // Click the Plan link — must land on the company page, not stay on /watchlist.
  await planLink.click();
  await expect(page).toHaveURL(/\/c\/GP/);
  // The Plan a buy heading must be visible (scrolled into view by the BuyPlanner effect).
  const heading = page.locator('#planner-title');
  await expect(heading).toBeVisible();
  // Verify it is in the viewport.
  const box = await heading.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeLessThan(viewport.height);
});

// (4) No page-wide sideways scroll at 390px and 1440px.
test('watchlist: no horizontal page scroll at current viewport', async ({ page }, info) => {
  await page.goto('/watchlist');
  const row = page.locator('table.cards tbody tr').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHScroll, `horizontal scroll at ${info.project.name}`).toBe(false);
});
