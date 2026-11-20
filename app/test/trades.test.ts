import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTrade } from '../../web/lib/trades.ts';
import { ApiError, getJson } from '../src/api.ts';
import { friendlyTradesError, groupByDate, holdingTotals, tradesPath, type HoldingRow } from '../src/trades.ts';

const h = (x: Partial<HoldingRow>): HoldingRow => ({ code: 'X', shares: 0, avgCost: 0, invested: 0, realised: 0, trades: 1, price: null, value: null, unrealised: null, ...x });

test('holdingTotals sums priced open holdings, all realised P/L, and counts unpriced ones', () => {
  const t = holdingTotals([
    h({ code: 'A', shares: 10, invested: 1000, value: 1200, realised: 50 }),
    h({ code: 'B', shares: 5, invested: 500, value: 400 }),
    h({ code: 'C', shares: 3, invested: 300, value: null }),
    h({ code: 'D', shares: 0, realised: -20 }),
  ]);
  assert.deepEqual(t, { value: 1600, unrealised: 100, unrealisedPct: (100 / 1500) * 100, realised: 30, unpriced: 1 });
  assert.equal(holdingTotals([]).unrealisedPct, null);
});

test('groupByDate keeps the newest-first order and groups the same date together', () => {
  const g = groupByDate([{ date: '2026-11-19', id: 1 }, { date: '2026-11-19', id: 2 }, { date: '2026-11-18', id: 3 }]);
  assert.deepEqual(g.map((x) => [x.title, x.data.map((d) => d.id)]), [['2026-11-19', [1, 2]], ['2026-11-18', [3]]]);
});

test('form values are checked with the same rules and messages as the server', () => {
  const form = { date: '2026-11-19', code: 'gp', side: 'BUY', quantity: '100', price: '226.70', commission: '', note: '' };
  const ok = validateTrade(form, '2026-11-20');
  assert.deepEqual(ok, { ok: true, value: { date: '2026-11-19', code: 'GP', side: 'BUY', quantity: 100, price: 226.7, commission: null, note: '', account: 'real' } });
  assert.deepEqual(validateTrade({ ...form, date: '2026-02-30' }, '2026-11-20'), { ok: false, error: 'Date must be a real date like 2026-11-19.' });
  assert.deepEqual(validateTrade({ ...form, quantity: '1.5' }, '2026-11-20'), { ok: false, error: 'Quantity must be a whole number of shares, 1 or more.' });
});

test('401 and 503 from the trades API become clear setup messages; the HTTP status is kept on ApiError', async () => {
  const fail = (status: number) => getJson('http://pc', '/api/trades', async () => ({ ok: false, status, json: async () => ({ error: 'x' }) })).catch(friendlyTradesError);
  assert.match(((await fail(401)) as Error).message, /Enter the trades key/);
  assert.match(((await fail(503)) as Error).message, /Trades are not set up on the server/);
  const other = (await fail(400)) as ApiError;
  assert.equal(other.message, 'x');
  assert.equal(other.status, 400);
});

test('the practice switch picks the paper list; the form sends the chosen account', () => {
  assert.equal(tradesPath('real'), '/api/trades');
  assert.equal(tradesPath('paper'), '/api/trades?account=paper');
  const form = { date: '2026-11-19', code: 'GP', side: 'BUY', quantity: '1', price: '226.9', commission: '', note: '' };
  const v = validateTrade({ ...form, account: 'paper' }, '2026-11-20');
  assert.ok(v.ok && v.value.account === 'paper');
});
