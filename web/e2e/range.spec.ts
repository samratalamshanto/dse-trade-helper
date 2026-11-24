import { test, expect } from './fixtures';

const COMPANIES_RESP = {
  rows: [
    { code: 'GP', name: 'Grameenphone', sector: 'Telecom', category: 'A', price: 300, weekLow52: 200, weekHigh52: 400,
      changePct: 0.5, signal: 'research', score: 85, fraud: 'clean', flags: [],
      pe: 15, dividendYield: 5, epsCagr: 10, change1y: 20, dailyValue: 5e7, stale: false },
    { code: 'ROBI', name: 'Robi Axiata', sector: 'Telecom', category: 'B', price: 52, weekLow52: 40, weekHigh52: 60,
      changePct: -0.2, signal: 'neutral', score: 65, fraud: 'clean', flags: [],
      pe: 20, dividendYield: 2, epsCagr: 5, change1y: 10, dailyValue: 1e7, stale: false },
    { code: 'SQURPHARMA', name: 'Square Pharma', sector: 'Pharma', category: 'A', price: 220, weekLow52: 180, weekHigh52: 240,
      changePct: 0.1, signal: 'research', score: 90, fraud: 'clean', flags: [],
      pe: 18, dividendYield: 3, epsCagr: 12, change1y: 15, dailyValue: 3e7, stale: false },
    { code: 'BRAC', name: 'BRAC Bank', sector: 'Bank', category: 'A', price: 70, weekLow52: 60, weekHigh52: 100,
      changePct: 0.3, signal: 'caution', score: 55, fraud: 'clean', flags: [],
      pe: 12, dividendYield: 4, epsCagr: 8, change1y: 5, dailyValue: 2e7, stale: false },
  ],
  codes: [
    { code: 'GP', sector: 'Telecom' },
    { code: 'ROBI', sector: 'Telecom' },
    { code: 'SQURPHARMA', sector: 'Pharma' },
    { code: 'BRAC', sector: 'Bank' },
  ],
  medians: { Telecom: 17.5, Pharma: 18, Bank: 12 },
  scan: { running: false, done: 4, total: 4 },
  session: null,
};

// Position in the range: BRAC 25%, GP 50%, ROBI 60%, SQURPHARMA 67%. Above the low: BRAC 16.7%, SQURPHARMA 22.2%, ROBI 30%, GP 50%.
const NEAR_LOW_ORDER = ['BRAC', 'GP', 'ROBI', 'SQURPHARMA'];
const RISEN_ORDER = ['SQURPHARMA', 'ROBI', 'GP', 'BRAC'];

const ROBI_TRADE = {
  id: 'robi1', date: '2026-01-05', code: 'ROBI', side: 'BUY',
  quantity: 100, price: 44, commission: null, note: '',
  source: 'manual', createdAt: '2026-01-05T04:00:00.000Z', account: 'real',
};

const HOLDINGS_RESP = {
  trades: [ROBI_TRADE],
  holdings: [{ code: 'ROBI', shares: 100, avgCost: 44, invested: 4400, realised: 0, trades: 1, price: 50, value: 5000, unrealised: 600 }],
  warnings: [],
  badRows: [],
  settings: { default: { stopPct: 10, targetPct: 20 }, perCode: {} },
};

const rows = (page: import('@playwright/test').Page) => page.locator('table.cards tbody tr');
const codes = async (page: import('@playwright/test').Page) => {
  const cells = await rows(page).locator('td:first-child b.mono').allInnerTexts();
  return cells.map((c) => c.trim());
};

test.describe('/range', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/companies', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COMPANIES_RESP) }));
    await page.route('**/api/portfolio/value', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOLDINGS_RESP) }));
    await page.goto('/range');
    await expect(page.getByRole('heading', { name: '52-week range' })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
  });

  test('default tab is Near the low, sorted ascending by Position', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Near the 52-week low' })).toHaveAttribute('aria-current', 'page');
    expect(await codes(page)).toEqual(NEAR_LOW_ORDER);
    await expect(page.locator('th[data-sort="position"]')).toHaveAttribute('aria-sort', 'ascending');
    await expect(rows(page).first()).toContainText('25% of range · 16.7% above low');
    await expect(rows(page).first()).toContainText('৳60.00 – ৳100.00');
  });

  test('an old link sorted by Above low % sorts by Position', async ({ page }, info) => {
    await page.goto('/range?sort=aboveLow&dir=-1');
    await expect.poll(() => codes(page)).toEqual(RISEN_ORDER);
    if (info.project.name !== 'phone') await expect(page.locator('th[data-sort="position"]')).toHaveAttribute('aria-sort', 'descending');
  });

  test('flipping sort on Position reverses the order', async ({ page }, info) => {
    if (info.project.name === 'phone') {
      await page.getByRole('button', { name: 'Low to high' }).click();
    } else {
      await page.getByRole('button', { name: 'Position', exact: true }).click();
    }
    await expect(page).toHaveURL(/dir=-1/);
    expect(await codes(page)).toEqual([...NEAR_LOW_ORDER].reverse());
  });

  test('Risen from the low tab sorts by Position descending', async ({ page }) => {
    await page.getByRole('link', { name: 'Risen from the low' }).click();
    await expect(page).toHaveURL(/view=risen/);
    await expect(page.getByRole('link', { name: 'Risen from the low' })).toHaveAttribute('aria-current', 'page');
    expect(await codes(page)).toEqual(RISEN_ORDER);
  });

  test('My holdings switch shows only ROBI with extra columns', async ({ page }, info) => {
    await page.addInitScript((t) => localStorage.setItem('myTrades', JSON.stringify([t])), ROBI_TRADE);
    await page.reload();
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'My holdings' }).click();
    await expect(page).toHaveURL(/who=holdings/);
    await expect(page.getByRole('button', { name: 'My holdings' })).toHaveAttribute('aria-pressed', 'true');
    const holdingCodes = await codes(page);
    expect(holdingCodes).toEqual(['ROBI']);
    await expect(rows(page).first()).toContainText('44');
    // On a phone the table becomes cards (no header row), so check the cell labels there.
    const phone = info.project.name === 'phone';
    for (const [key, label] of [['avgCost', 'Your avg price'], ['gainPct', 'Your gain %'], ['shares', 'Shares']]) {
      await expect(phone ? page.locator(`td[data-label="${label}"]`).first() : page.locator(`th[data-sort="${key}"]`)).toBeVisible();
    }
  });

  test('My watchlist shows only watched companies, and an empty watchlist says so', async ({ page }) => {
    await page.getByRole('button', { name: 'My watchlist' }).click();
    await expect(page).toHaveURL(/who=watchlist/);
    await expect(page.locator('#view').getByText('Your watchlist is empty.')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('watchlist', JSON.stringify(['ROBI'])));
    await page.reload();
    await expect.poll(() => codes(page)).toEqual(['ROBI']);
  });

  test('a quick pick narrows the table, and the tabs keep it', async ({ page }) => {
    await page.getByRole('button', { name: 'Passes the checks' }).click();
    await expect(page).toHaveURL(/pick=good/);
    await expect.poll(() => codes(page)).toEqual(['GP', 'SQURPHARMA']);
    await page.getByRole('link', { name: 'Risen from the low' }).click();
    await expect(page).toHaveURL(/pick=good/);
    await expect.poll(() => codes(page)).toEqual(['SQURPHARMA', 'GP']);
  });

  test('a rule with a quick pick only matches companies that pass it', async ({ page }) => {
    await page.getByLabel('Kind', { exact: true }).selectOption('nearLow');
    await page.getByLabel('Within %', { exact: true }).fill('30');
    await page.getByLabel('Quick pick', { exact: true }).selectOption('good');
    await page.getByRole('button', { name: 'Add rule' }).click();
    // BRAC is nearer its low (16.7%) but does not pass the checks; SQURPHARMA (22.2%) does.
    await expect(page.locator('.range-matches li')).toHaveCount(1);
    await expect(page.locator('.range-matches li').first()).toContainText('SQURPHARMA');
    await expect(page.locator('.range-rule-head')).toContainText('Passes the checks');
  });

  test('no holdings shows the empty state with a Portfolio link', async ({ page }) => {
    await page.getByRole('button', { name: 'My holdings' }).click();
    await expect(page.locator('td').filter({ hasText: /No holdings yet/ })).toBeVisible();
    await expect(page.locator('#view').getByRole('link', { name: 'Portfolio' })).toBeVisible();
  });

  test('Within filter keeps only rows at or below the threshold', async ({ page }) => {
    await expect(rows(page)).toHaveCount(4);
    await page.getByLabel('Within % of the low').fill('20');
    await expect(page).toHaveURL(/within=20/);
    const visible = await codes(page);
    expect(visible).toEqual(['BRAC']);
  });

  test('adding a rule, seeing it matched, and deleting it', async ({ page }) => {
    await page.getByLabel('Kind', { exact: true }).selectOption('nearLow');
    await page.getByLabel('Within %', { exact: true }).fill('30');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText(/Near its low 30%/)).toBeVisible();
    await expect(page.locator('.range-matches li').first()).toContainText('BRAC');
    await page.getByRole('button', { name: /Delete rule/ }).first().click();
    await expect(page.getByText(/Near its low 30%/)).toHaveCount(0);
    await expect(page.getByText('No rules yet')).toBeVisible();
  });

  test('rules survive a page reload', async ({ page }) => {
    await page.getByLabel('Kind', { exact: true }).selectOption('nearLow');
    await page.getByLabel('Within %', { exact: true }).fill('20');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText(/Near its low 20%/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '52-week range' })).toBeVisible();
    await expect(page.getByText(/Near its low 20%/)).toBeVisible();
  });

  test('a row whose price is far outside its 52-week range is marked and sorted last', async ({ page }) => {
    const sibl = { ...COMPANIES_RESP.rows[0], code: 'SIBL', name: 'Social Islami Bank', price: 3, weekLow52: 122, weekHigh52: 590 };
    await page.route('**/api/companies', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...COMPANIES_RESP, rows: [...COMPANIES_RESP.rows, sibl] }) }));
    await page.reload();
    await expect(rows(page)).toHaveCount(5);
    expect(await codes(page)).toEqual([...NEAR_LOW_ORDER, 'SIBL']);
    await expect(rows(page).last().getByText('Data looks wrong: the price is far outside its 52-week range.')).toBeVisible();
  });

  test('no console errors on page load', async ({ page }) => {
    await page.waitForLoadState('networkidle');
  });
});
