import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePlan } from '../../web/lib/plans.ts';
import { afterBuyLine, type BuyPlan, dividendLine, formFromBuyPlan, inputFromRow, oddsSentence, parseBudget, picksPath, planQuery, type PlanRow, splitLine, STATUS_LOOK } from '../src/plans.ts';

const plan = (x: Partial<BuyPlan>): BuyPlan => ({
  code: 'GP', quantity: 10, price: 100, cost: 1000, position52: 0.5, sma20: 101, sma50: 99, vsSma20Pct: -1, trend: 'sideways', typicalDailyMovePct: 1.2,
  moveOdds: [{ pct: 1, within: 5, fell: 60, rose: 55 }, { pct: 2, within: 5, fell: 35, rose: 30 }], daysCheaperPct: 40, dividend: null, afterBuy: null,
  warnings: [], action: 'split', label: 'Split: part now, price alert for the rest', tone: 'info', buyNow: 5, later: 5, alertPrice: 98, reasons: [], sample: 240, avgPrice: 100, commission: 4, commissionPct: 0.4, totalWithCommission: 1004, ...x,
});

test('planQuery accepts whole shares or a taka budget and rejects the rest', () => {
  assert.deepEqual(planQuery('qty', '1,000'), { ok: true, query: 'qty=1000' });
  assert.deepEqual(planQuery('budget', '৳20,000.50'), { ok: true, query: 'budget=20000.5' });
  for (const bad of ['', '0', '1.5', 'ten', '-3', '10000001']) assert.equal(planQuery('qty', bad).ok, false, bad);
  for (const bad of ['', '0', 'abc', '1000000001']) assert.equal(planQuery('budget', bad).ok, false, bad);
});

test('parseBudget and picksPath', () => {
  assert.equal(parseBudget(' 5,000 '), 5000);
  assert.equal(parseBudget('0'), null);
  assert.equal(picksPath(null), '/api/picks');
  assert.equal(picksPath(5000), '/api/picks?budget=5000');
});

test('splitLine describes buy now, the rest at the alert, or nothing now', () => {
  assert.equal(splitLine(plan({})), 'Buy 5 now at about ৳100.00 (৳500.00), and the other 5 if it reaches ৳98.00.');
  assert.equal(splitLine(plan({ action: 'buy-now', buyNow: 10, later: 0, alertPrice: null })), 'Buy 10 now at about ৳100.00 (৳1,000.00).');
  assert.equal(splitLine(plan({ action: 'wait', buyNow: 0, later: 10 })), 'Buy none of the 10 now — set an alert at ৳98.00.');
  assert.equal(splitLine(plan({ action: 'avoid', buyNow: 0, later: 10, alertPrice: null })), 'Buy none of the 10 now.');
});

test('oddsSentence speaks about the past 2% moves, or nothing without data', () => {
  assert.equal(oddsSentence(plan({})), 'In the last year, within 5 trading days it fell 2% or more on 35% of days and rose 2% or more on 30% of days.');
  assert.equal(oddsSentence(plan({ moveOdds: [{ pct: 2, within: 5, fell: null, rose: null }] })), null);
});

test('dividend and after-buy lines', () => {
  assert.equal(dividendLine(plan({})), null);
  assert.equal(dividendLine(plan({ dividend: { lastBuyDate: '2026-11-25', tradingDaysLeft: 1, cashPerShare: 1.5 } })), 'Own it at the end of 2026-11-25 to get ৳1.50 a share — 1 trading day left.');
  assert.equal(afterBuyLine(plan({ afterBuy: { shares: 30, avgCost: 95.5, weightPct: 12.4 } })), 'After this buy, if the alert price fills: 30 shares at an average of ৳95.50, 12% of your holdings.');
  assert.equal(afterBuyLine(plan({ afterBuy: { shares: 30, avgCost: 95.5, weightPct: null }, buyNow: 10, later: 0, alertPrice: null })), 'After this buy: 30 shares at an average of ৳95.50.');
});

test('every live status has a label, a palette tone and an icon', () => {
  for (const s of ['waiting', 'reached', 'expired', 'done', 'cancelled'] as const) assert.ok(STATUS_LOOK[s].label && STATUS_LOOK[s].tone && STATUS_LOOK[s].icon);
  assert.equal(STATUS_LOOK.reached.tone, 'good');
});

test('a checked buy plan becomes a form the server rules accept', () => {
  const v = validatePlan({ ...formFromBuyPlan(plan({})), until: '', status: '' }, '2026-11-20');
  assert.deepEqual(v, { ok: true, value: { code: 'GP', quantity: 10, boughtNow: 5, targetPrice: 98, until: null, note: 'Split: part now, price alert for the rest', status: 'active' } });
  // "Do not buy now" has no alert price: the user must add a target before saving.
  assert.deepEqual(validatePlan(formFromBuyPlan(plan({ buyNow: 0, alertPrice: null })), '2026-11-20'), { ok: false, error: 'Set a target price for the shares you have not bought yet.' });
});

test('form values are checked with the server rules and messages', () => {
  const form = { code: 'gp', quantity: '10', boughtNow: '', targetPrice: '250.5', until: '2026-12-31', note: 'x', status: 'active' };
  assert.equal(validatePlan(form, '2026-11-20').ok, true);
  assert.deepEqual(validatePlan({ ...form, boughtNow: '11' }, '2026-11-20'), { ok: false, error: 'Shares bought now must be a whole number, no more than the quantity.' });
  assert.deepEqual(validatePlan({ ...form, until: '2026-11-19' }, '2026-11-20'), { ok: false, error: 'The end date must be a real date, today or later.' });
});

test('marking an old plan done keeps its fields and passes the server check', () => {
  const row: PlanRow = { id: 'a', code: 'GP', quantity: 10, boughtNow: 5, targetPrice: 98, until: '2026-01-01', note: '', status: 'active', createdAt: 'x', price: 100, live: { status: 'expired', remaining: 5, awayPct: null, text: '' } };
  assert.equal(validatePlan(inputFromRow(row, 'done'), '2026-11-20').ok, true);
});
