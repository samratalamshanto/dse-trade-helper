import fs from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { test, expect } from './fixtures';

// Browser mode (no key): data lives in localStorage; the keyless /api/portfolio/* routes only compute. Every Sheet call is mocked.
const KEY = 'k'.repeat(20);
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const today = () => new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);
const stored = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]') as Record<string, unknown>[], key);
const trade = (id: string, code: string, quantity: number) => ({ id, date: '2026-01-05', code, side: 'BUY', quantity, price: 100, commission: null, note: '', source: 'manual', createdAt: '2026-01-05T04:00:00.000Z', account: 'real' });
const holdingsPanel = (page: Page) => page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Holdings', exact: true }) });

async function addBuy(page: Page, code: string, quantity: string, price: string) {
  await page.getByLabel('Code').fill(code);
  await page.getByLabel('Quantity').fill(quantity);
  await page.getByLabel('Price ৳').fill(price);
  await page.getByRole('button', { name: 'Add trade' }).click();
}

// A dev key server on this machine would switch the app to sheet mode; these tests always get no key.
test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:3011/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"key":""}' }));
});

test.describe('browser mode: a new visitor needs no password', () => {
  test('adds a BUY, sees the holding and summary, and it is still there after a reload', async ({ page }) => {
    await page.route('**/api/trades**', (r) => r.abort());
    await page.goto('/portfolio');
    await expect(page.getByText('Saved in this browser only.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Password')).toBeHidden();
    await addBuy(page, 'gp', '10', '250');
    await expect(holdingsPanel(page).locator('tbody tr').filter({ hasText: 'GP' })).toContainText('10');
    await expect(page.getByText('Invested')).toBeVisible();
    await expect(page.locator('.panel').filter({ hasText: 'Invested' }).first()).toContainText('৳2,500.00');
    await expect(page.getByRole('link', { name: 'Trades as a spreadsheet (CSV)' })).toHaveAttribute('download', 'my-trades.csv');
    await page.reload();
    await expect(holdingsPanel(page).locator('tbody tr').filter({ hasText: 'GP' })).toContainText('10');
    expect((await stored(page, 'myTrades')).map((t) => [t.code, t.side, t.quantity])).toEqual([['GP', 'BUY', 10]]);
  });

  test('a plan saved from /c/GP shows on /plans and counts a BUY made after it', async ({ page }) => {
    const BASE = { code: 'GP', quantity: 10, price: 226.7, cost: 2267, position52: 0.08, sma20: 229.91, sma50: 236.28, vsSma20Pct: -1.39, trend: 'falling', typicalDailyMovePct: 0.61,
      moveOdds: [{ pct: 2, within: 5, fell: 24, rose: 16 }], daysCheaperPct: 2, dividend: null, afterBuy: null, warnings: [], reasons: ['Still in a falling trend'], sample: 255,
      action: 'split', label: 'Split: part now, price alert for the rest', tone: 'info', buyNow: 5, later: 5, alertPrice: 222.2 };
    let planUrl = '';
    await page.route('**/api/plan/GP?**', (r) => { planUrl = r.request().url(); return json(r, 200, BASE); });
    await page.route('**/api/plans**', (r) => r.abort());
    await page.goto('/c/GP');
    const p = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Plan a buy' }) });
    await p.getByLabel('How many shares').fill('10');
    await p.getByRole('button', { name: 'Plan it' }).click();
    // The browser's holding goes along so "after this buy" works without the Sheet.
    await expect.poll(() => new URL(planUrl).searchParams.get('shares')).toBe('0');
    await p.getByRole('button', { name: 'Save as plan' }).click();
    await p.getByRole('button', { name: 'Save plan' }).click();
    await expect(p.getByRole('link', { name: 'See my buy plans →' })).toBeVisible();

    await page.goto('/plans');
    const card = page.locator('article').filter({ hasText: 'GP' });
    await expect(card).toContainText('Bought 0 of 10');
    await page.goto('/portfolio');
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(today());
    await addBuy(page, 'GP', '3', '226');
    await expect(holdingsPanel(page)).toContainText('GP');
    await page.goto('/plans');
    await expect(card).toContainText('Bought 3 of 10');
  });

  test('the dashboard shows the browser holding in My holdings today', async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('myTrades', JSON.stringify([t])), trade('a1', 'GP', 7));
    await page.goto('/');
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'My holdings today' }) });
    await expect(card).toContainText('GP');
    await expect(card).toContainText('7 shares');
  });

  test('old Portfolio lots become browser trades; one that cannot be saved stays for a retry', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('portfolio', JSON.stringify([{ code: 'ACI', shares: 10, buyPrice: 180, buyDate: '2026-03-01' }, { code: 'ROBI', shares: 5, buyPrice: 30, buyDate: '2999-01-01' }])); } });
    await page.goto('/portfolio');
    await expect(page.getByText('2 holdings are saved only in this browser')).toBeVisible();
    await page.getByRole('button', { name: 'Move 2 into my trades' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'cannot be in the future' })).toBeVisible();
    expect((await stored(page, 'portfolio')).map((l) => l.code)).toEqual(['ROBI']);
    expect((await stored(page, 'myTrades')).map((t) => [t.code, t.side, t.quantity, t.date])).toEqual([['ACI', 'BUY', 10, '2026-03-01']]);
    await expect(page.getByRole('button', { name: 'Move 1 into my trades' })).toBeVisible();
  });
});

test.describe('browser mode → Google Sheet (Sheet API mocked)', () => {
  test.use({ allowedConsole: [/status of 503/] });

  test('moves trades, plans and limits one call at a time with their ids; a failure half-way keeps only the unsaved items', async ({ page }) => {
    const plan = { id: '11111111-1111-4111-8111-111111111111', code: 'GP', quantity: 10, boughtNow: 0, targetPrice: 222.2, until: null, note: '', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' };
    const limits = { default: { stopPct: 8, targetPct: 25 }, perCode: {} };
    await page.addInitScript(([t, pl, l]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('myTrades', JSON.stringify(t));
      localStorage.setItem('myPlans', JSON.stringify([pl]));
      localStorage.setItem('myLimits', JSON.stringify(l));
    }, [[trade('a1', 'GP', 7), trade('a2', 'ACI', 2)], plan, limits] as const);
    const posted: Record<string, unknown>[] = [];
    let failNext = true;
    await page.route('**/api/trades', (r) => {
      if (r.request().method() !== 'POST') return json(r, 200, { trades: [], holdings: [], warnings: [], badRows: [], settings: { default: { stopPct: 10, targetPct: 20 }, perCode: {} } });
      if (posted.length === 1 && failNext) { failNext = false; return json(r, 503, { error: 'Sheet is busy.' }); }
      posted.push(r.request().postDataJSON() as Record<string, unknown>);
      return json(r, 201, {});
    });
    await page.route('**/api/plans', (r) => { posted.push(r.request().postDataJSON() as Record<string, unknown>); return json(r, 201, {}); });
    await page.route('**/api/trades/settings', (r) => { posted.push({ settings: r.request().postDataJSON() }); return json(r, 200, {}); });
    await page.goto('/portfolio');
    await page.getByText('Sync with my Google Sheet').click();
    const sync = page.locator('details').filter({ has: page.getByText('Sync with my Google Sheet') });
    await sync.getByLabel('Password').fill(KEY);
    await sync.getByRole('button', { name: 'Connect' }).click();
    await expect(sync.getByText('2 trades and 1 plan and your limits are still saved only in this browser.')).toBeVisible();

    await sync.getByRole('button', { name: 'Move into my Google Sheet' }).click();
    await expect(sync.getByRole('alert')).toHaveText('Could not reach your Google Sheet. Nothing was lost: press Move again to carry on.');
    expect((await stored(page, 'myTrades')).map((t) => t.id)).toEqual(['a2']);
    expect(await stored(page, 'myPlans')).toHaveLength(1);

    await sync.getByRole('button', { name: 'Move into my Google Sheet' }).click();
    await expect(sync.getByText(/still saved only in this browser/)).toHaveCount(0);
    expect(posted.map((b) => b.id ?? 'limits')).toEqual(['a1', 'a2', plan.id, 'limits']);
    expect(posted[2]).toMatchObject({ code: 'GP', createdAt: plan.createdAt });
    expect(posted[3]).toEqual({ settings: limits });
    expect(await stored(page, 'myTrades')).toEqual([]);
    expect(await stored(page, 'myPlans')).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('myLimits'))).toBe('');
  });
});

test.describe('browser mode: export and import my data', () => {
  const summary = (page: Page) => page.locator('div.panel').filter({ hasText: 'Value now' }).first();
  const seed = (page: Page, trades: unknown[]) => page.addInitScript((t) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('myTrades', JSON.stringify(t)); } }, trades);
  const exportFile = async (page: Page) => {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export my data' }).click();
    const file = await (await dl).path();
    return { file, body: JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> };
  };
  const importFile = (page: Page, body: unknown) => page.getByLabel('Import my data').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)) });

  test('export → clear → import (replace) restores the same Portfolio numbers', async ({ page }) => {
    await seed(page, [trade('a1', 'GP', 7), trade('a2', 'ACI', 2)]);
    await page.goto('/portfolio');
    await expect(summary(page)).toContainText('৳900.00');
    const before = await summary(page).innerText();
    const { file, body } = await exportFile(page);
    expect(body).toMatchObject({ app: 'trade-helper', version: 1, plans: [], limits: null, watchlist: [] });
    expect((body.trades as { id: string }[]).map((t) => t.id)).toEqual(['a1', 'a2']);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByText('No trades yet.', { exact: false })).toBeVisible();
    await page.getByLabel('Import my data').setInputFiles(file);
    await expect(page.getByText('This file has 2 trades, 0 plans, 0 watchlist codes, 0 alerts.')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Replace what is here' }).click();
    await expect(summary(page)).toContainText('৳900.00');
    expect(await summary(page).innerText()).toBe(before);
  });

  test('add keeps what is here and skips a trade it already has; a wrong file is refused', async ({ page }) => {
    await seed(page, [trade('a1', 'GP', 7)]);
    await page.goto('/portfolio');
    await importFile(page, { app: 'other' });
    await expect(page.getByRole('alert').filter({ hasText: 'backup' })).toHaveText('This is not a Trade Helper backup file.');
    await importFile(page, { app: 'trade-helper', version: 1, trades: [trade('a1', 'GP', 7), trade('b1', 'ACI', 2)], plans: [], watchlist: ['GP'] });
    await expect(page.getByText('This file has 2 trades, 0 plans, 1 watchlist code, 0 alerts.')).toBeVisible();
    await page.getByRole('button', { name: 'Add to what is here' }).click();
    await expect(page.getByText('Imported: 2 trades, 0 plans, 1 watchlist code, 0 alerts.')).toBeVisible();
    await expect(holdingsPanel(page)).toContainText('ACI');
    expect((await stored(page, 'myTrades')).map((t) => t.id)).toEqual(['a1', 'b1']);
    expect(await page.evaluate(() => localStorage.getItem('watchlist'))).toBe('["GP"]');
  });

  test('unreadable saved data keeps the rest working and can be downloaded or removed', async ({ page }) => {
    await seed(page, [trade('a1', 'GP', 7), { id: 'broken' }]);
    await page.goto('/portfolio');
    await expect(holdingsPanel(page)).toContainText('GP');
    await expect(page.getByText('1 saved trade could not be read.')).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the unreadable data' }).click();
    expect(JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'))).toEqual([{ id: 'broken' }]);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Remove them' }).click();
    await expect(page.getByText('could not be read')).toHaveCount(0);
    expect((await stored(page, 'myTrades')).map((t) => t.id)).toEqual(['a1']);
  });
});
