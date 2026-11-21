import type { Page, Route } from '@playwright/test';
import { test, expect } from './fixtures';

// /api/plans writes to the owner's Google Sheet: plan, picks and plans calls are all mocked.
const KEY = 'k'.repeat(20);
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const BASE = {
  code: 'GP', quantity: 10, price: 226.7, cost: 2267, position52: 0.08, sma20: 229.91, sma50: 236.28, vsSma20Pct: -1.39, trend: 'falling', typicalDailyMovePct: 0.61,
  moveOdds: [{ pct: 1, within: 5, fell: 41, rose: 30 }, { pct: 2, within: 5, fell: 24, rose: 16 }, { pct: 3, within: 5, fell: 11, rose: 8 }, { pct: 5, within: 5, fell: 3, rose: 1 }],
  daysCheaperPct: 2, dividend: null, afterBuy: null, warnings: [], reasons: ['Still in a falling trend'], sample: 255,
};
const PLANS = {
  split: { ...BASE, action: 'split', label: 'Split: part now, price alert for the rest', tone: 'info', buyNow: 5, later: 5, alertPrice: 222.2 },
  'buy-now': { ...BASE, action: 'buy-now', label: 'Rules see no reason to wait', tone: 'good', buyNow: 10, later: 0, alertPrice: null },
  wait: { ...BASE, action: 'wait', label: 'Rules say wait — set a price alert', tone: 'warn', buyNow: 0, later: 10, alertPrice: 220 },
  avoid: { ...BASE, action: 'avoid', label: 'Rules flag risks — review before buying', tone: 'bad', buyNow: 0, later: 10, alertPrice: null, warnings: ['Thinly traded — it can be hard to buy or sell at a fair price'] },
  'buy-before-dividend': { ...BASE, action: 'buy-before-dividend', label: 'Dividend deadline is close', tone: 'info', buyNow: 10, later: 0, alertPrice: null,
    dividend: { lastBuyDate: '2026-11-26', tradingDaysLeft: 4, cashPerShare: 12.5 }, afterBuy: { shares: 60, avgCost: 240.1, weightPct: 30 } },
} as const;

const plan = (id: string, over: Record<string, unknown>) => ({ id, code: 'GP', quantity: 10, boughtNow: 5, targetPrice: 222.2, until: '2026-12-04', note: 'n', status: 'active', createdAt: '2026-11-20T00:00:00Z', price: 226.7, ...over });
const LIST = {
  badRows: [],
  plans: [
    plan(ID1, { code: 'BRACBANK', price: 60, targetPrice: 62, live: { status: 'reached', remaining: 5, awayPct: -3.2, text: 'Target ৳62.00 reached — buy the other 5 now' } }),
    plan(ID2, { live: { status: 'waiting', remaining: 5, awayPct: 2, text: 'Waiting — 2.0% above your ৳222.20 target' } }),
    plan('33333333-3333-4333-8333-333333333333', { status: 'done', live: { status: 'done', remaining: 0, awayPct: null, text: 'Done' } }),
    plan('44444444-4444-4444-8444-444444444444', { until: '2026-11-01', live: { status: 'expired', remaining: 5, awayPct: null, text: 'Ended 2026-11-01 — edit the date or cancel it' } }),
  ],
};
const PICKS = { budget: 20000, today: '2026-11-20', picks: [
  { code: 'DHAKABANK', name: 'Dhaka Bank PLC.', price: 11.2, score: 94, position52: 0.077, vsSma20Pct: 0.58, trend: 'sideways', shares: 1785, cost: 19992 },
  { code: 'BRACBANK', name: 'BRAC Bank PLC.', price: 66.6, score: 94, position52: 0.2, vsSma20Pct: 0.18, trend: 'rising', shares: 300, cost: 19980 },
] };

const withKey = (page: Page) => page.addInitScript((k) => localStorage.setItem('tradesKey', k), KEY);
const planner = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Plan a buy' }) });

test.describe('buy planner on the company page (API mocked)', () => {
  for (const [action, body] of Object.entries(PLANS)) {
    test(`renders the ${action} plan`, async ({ page }) => {
      await page.route('**/api/plan/GP?**', (r) => json(r, 200, body));
      await page.goto('/c/GP');
      const p = planner(page);
      await p.getByLabel('How many shares').fill('10');
      await p.getByRole('button', { name: 'Plan it' }).click();
      await expect(p.locator(`[data-action="${action}"]`)).toHaveText(body.label);
      await expect(p.getByText('Learning aid, not investment advice', { exact: false }).first()).toBeVisible();
      await expect(p.getByText(/2% fall was more common than a 2% rise/)).toBeVisible();
      if (action === 'split') await expect(p.getByText('Buy 5 now · 5 later at ৳222.20')).toBeVisible();
      if (action === 'avoid') await expect(p.getByText('Thinly traded', { exact: false })).toBeVisible();
      if (action === 'buy-before-dividend') {
        await expect(p.getByText(/own it at the end of 2026-11-26/)).toBeVisible();
        await expect(p.getByText(/60 shares at an average ৳240.10/)).toBeVisible();
      }
    });
  }

  test('budget toggle sends ?budget= and a bad answer shows the error', async ({ page }) => {
    test.info().annotations.push({ type: 'note', description: 'Chrome logs the mocked 400 as a console error; only that line is allowed.' });
    let url = '';
    await page.route('**/api/plan/GP?**', (r) => { url = r.request().url(); return json(r, 400, { error: '৳100 is less than one share at ৳226.70.' }); });
    await page.goto('/c/GP');
    const p = planner(page);
    await p.getByRole('button', { name: 'Budget ৳' }).click();
    await expect(p.getByRole('button', { name: 'Budget ৳' })).toHaveAttribute('aria-pressed', 'true');
    await p.getByLabel('How much taka').fill('100');
    await p.getByRole('button', { name: 'Plan it' }).click();
    await expect(p.getByRole('alert')).toHaveText('৳100 is less than one share at ৳226.70.');
    expect(new URL(url).searchParams.get('budget')).toBe('100');
  });
  test.use({ allowedConsole: [/status of 400/] });

  test('save as plan without a key points to My trades', async ({ page }) => {
    await page.route('**/api/plan/GP?**', (r) => json(r, 200, PLANS.split));
    await page.goto('/c/GP');
    const p = planner(page);
    await p.getByLabel('How many shares').fill('10');
    await p.getByRole('button', { name: 'Plan it' }).click();
    await p.getByRole('button', { name: 'Save as plan' }).click();
    await expect(p.getByRole('status')).toContainText('Enter your trades key on My trades first');
    await expect(p.getByRole('link', { name: 'My trades' })).toHaveAttribute('href', '/trades');
  });

  test('save as plan posts the prefilled plan with the key', async ({ page }) => {
    await withKey(page);
    let posted: Record<string, string> = {};
    await page.route('**/api/plan/GP?**', (r) => json(r, 200, PLANS.split));
    await page.route('**/api/plans', (r) => { posted = r.request().postDataJSON(); return json(r, 200, { id: ID1 }); });
    await page.goto('/c/GP');
    const p = planner(page);
    await p.getByLabel('How many shares').fill('10');
    await p.getByRole('button', { name: 'Plan it' }).click();
    await p.getByRole('button', { name: 'Save as plan' }).click();
    await p.getByLabel('Note').fill('e2e');
    const req = page.waitForRequest((q) => q.method() === 'POST' && q.url().endsWith('/api/plans'));
    await p.getByRole('button', { name: 'Save plan' }).click();
    expect((await req).headers()['x-trades-key']).toBe(KEY);
    expect(posted).toMatchObject({ code: 'GP', quantity: '10', boughtNow: '5', targetPrice: '222.2', note: 'e2e', status: 'active' });
    expect(posted.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(p.getByRole('link', { name: 'See my buy plans →' })).toBeVisible();
  });
});

test.describe('/plans (API mocked)', () => {
  test('statuses, reached first, and edit / done / cancel / delete calls', async ({ page }) => {
    await withKey(page);
    const calls: string[] = [];
    await page.route('**/api/plans**', (r) => {
      const q = r.request();
      if (q.method() !== 'GET') calls.push(`${q.method()} ${new URL(q.url()).pathname} ${q.postData() ?? ''}`);
      return json(r, 200, q.method() === 'GET' ? LIST : {});
    });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/plans');
    const cards = page.locator('article');
    await expect(cards).toHaveCount(4);
    await expect(cards.first()).toContainText('Target reached — buy the other 5 now');
    await expect(cards.nth(1).locator('.pill')).toHaveText('Waiting · 2.0% away');
    await expect(cards.nth(2).locator('.pill')).toHaveText('Done');
    await expect(cards.nth(3).locator('.pill')).toHaveText('Expired');
    await expect(cards.nth(2).getByRole('button', { name: 'Mark done' })).toHaveCount(0);

    const waiting = cards.nth(1);
    await waiting.getByRole('button', { name: 'Edit' }).click();
    await waiting.getByLabel('Target price ৳').fill('221');
    await waiting.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => calls.length).toBe(1);
    await waiting.getByRole('button', { name: 'Mark done' }).click();
    await expect.poll(() => calls.length).toBe(2);
    await waiting.getByRole('button', { name: 'Cancel plan' }).click();
    await expect.poll(() => calls.length).toBe(3);
    await waiting.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => calls.length).toBe(4);
    expect(calls[0]).toContain(`PUT /api/plans/${ID2} `);
    expect(JSON.parse(calls[0].split(' ').slice(2).join(' '))).toMatchObject({ code: 'GP', targetPrice: '221', status: 'active' });
    expect(JSON.parse(calls[1].split(' ').slice(2).join(' '))).toMatchObject({ status: 'done' });
    expect(JSON.parse(calls[2].split(' ').slice(2).join(' '))).toMatchObject({ status: 'cancelled' });
    expect(calls[3].trim()).toBe(`DELETE /api/plans/${ID2}`);
  });

  test('without a key it asks for the trades key', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Buy plans' })).toBeVisible();
    await expect(page.getByLabel('Trades key')).toBeVisible();
  });
});

test.describe('dashboard planner cards (API mocked)', () => {
  test('picks use the remembered budget and the plans card lists reached first', async ({ page }) => {
    await withKey(page);
    await page.addInitScript(() => localStorage.setItem('picksBudget', '20000'));
    const asked: string[] = [];
    await page.route('**/api/picks**', (r) => { asked.push(new URL(r.request().url()).search); return json(r, 200, PICKS); });
    await page.route('**/api/plans', (r) => json(r, 200, LIST));
    await page.route('**/api/trades**', (r) => json(r, 200, { trades: [], holdings: [], warnings: [], badRows: [] }));
    await page.goto('/');
    const picks = page.locator('section').filter({ has: page.getByRole('heading', { name: "Today's picks" }) });
    await expect(picks.getByRole('row').filter({ hasText: 'DHAKABANK' })).toContainText('1785');
    expect(asked[0]).toBe('?budget=20000');
    await picks.getByLabel('Your budget ৳').fill('50000');
    await picks.getByRole('button', { name: 'Show picks' }).click();
    await expect.poll(() => asked.at(-1)).toBe('?budget=50000');
    expect(await page.evaluate(() => localStorage.getItem('picksBudget'))).toBe('50000');

    const mini = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your buy plans' }) });
    await expect(mini.locator('li').first()).toContainText('BRACBANK');
    await expect(mini.locator('li').first()).toContainText('Target reached');
    await expect(mini.locator('li')).toHaveCount(3);
  });

  test('picks empty state, and no plans card without a key', async ({ page }) => {
    await page.route('**/api/picks**', (r) => json(r, 200, { budget: null, picks: [], today: '2026-11-20' }));
    await page.goto('/');
    await expect(page.getByText('No company fits these rules today.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your buy plans' })).toHaveCount(0);
  });
});
