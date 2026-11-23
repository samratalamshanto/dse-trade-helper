import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakEvenPrice, checkPosition, dividendsReceived, DEFAULT_STOP_PCT, DEFAULT_TARGET_PCT, parseSettings, settingsFromRows, settingsToRows, validLimits, type PositionInput } from '../lib/positions.ts';

const limits = { stopPct: DEFAULT_STOP_PCT, targetPct: DEFAULT_TARGET_PCT };
const FRIDAY = '2026-11-20';
const base: PositionInput = { shares: 1, avgCost: 100, price: 100, weightPct: 10, signal: 'neutral', fraud: 'clean', zone: 'middle', verdictKey: 'fair', dividend: null };
const check = (over: Partial<PositionInput>, l = limits) => checkPosition({ ...base, ...over }, l, FRIDAY);

test('past the stop-loss, high fraud risk or an Avoid signal means Review', () => {
  assert.equal(check({ price: 89 }).action, 'review');
  assert.match(check({ price: 89 }).reasons[0], /past your 10% stop-loss/);
  assert.equal(check({ fraud: 'high' }).action, 'review');
  assert.equal(check({ signal: 'avoid' }).action, 'review');
  assert.equal(check({ price: 91 }).action, 'hold');
});

test('the stop-loss is the owner’s own number', () => {
  assert.equal(check({ price: 93 }, { stopPct: 7, targetPct: 15 }).action, 'review');
  assert.equal(check({ price: 93 }).action, 'hold');
});

test('take some profit only when past the target AND priced high against its own history', () => {
  assert.equal(check({ price: 125, zone: 'high' }).action, 'take-profit');
  assert.equal(check({ price: 125, zone: 'middle' }).action, 'hold');
  assert.equal(check({ price: 115, zone: 'high' }).action, 'hold');
});

test('a clean company with a dividend deadline within 10 trading days is Hold — dividend', () => {
  const r = check({ dividend: { lastBuyDate: '2026-11-22', cashPct: 105 } });
  assert.equal(r.action, 'hold-dividend');
  assert.match(r.reasons[0], /105% cash.*1 trading day left/);
  assert.equal(check({ fraud: 'suspicious', dividend: { lastBuyDate: '2026-11-22', cashPct: 105 } }).action, 'hold');
  assert.equal(check({ dividend: { lastBuyDate: '2026-11-19', cashPct: 105 } }).action, 'hold');
  assert.equal(check({ dividend: { lastBuyDate: '2026-12-31', cashPct: 105 } }).action, 'hold');
});

test('a stop-loss beats a coming dividend', () => {
  assert.equal(check({ price: 80, dividend: { lastBuyDate: '2026-11-22', cashPct: 105 } }).action, 'review');
});

test('could buy more only for a worth-researching value share below cost that is a small part of holdings', () => {
  const good = { signal: 'research' as const, verdictKey: 'value', price: 95, weightPct: 10 };
  assert.equal(check(good).action, 'add');
  assert.equal(check({ ...good, weightPct: 30 }).action, 'hold');
  assert.equal(check({ ...good, price: 105 }).action, 'hold');
  assert.equal(check({ ...good, verdictKey: 'trap' }).action, 'hold');
});

test('no live price gives Hold with a plain reason, never NaN', () => {
  const r = check({ price: null });
  assert.equal(r.action, 'hold');
  assert.equal(r.plPct, null);
  assert.ok(r.reasons.includes('no live price'));
  assert.ok(!JSON.stringify(r).includes('NaN'));
});

test('limits must be positive percentages up to 95', () => {
  assert.deepEqual(validLimits({ stopPct: '8', targetPct: 25 }), { stopPct: 8, targetPct: 25 });
  for (const bad of [{ stopPct: 0.5, targetPct: 20 }, { stopPct: 0, targetPct: 20 }, { stopPct: -5, targetPct: 20 }, { stopPct: 10, targetPct: 'x' }, { stopPct: 100, targetPct: 20 }, {}]) assert.equal(validLimits(bad), null);
});

test('limit settings round-trip through sheet rows; bad rows fall back to defaults', () => {
  const s = settingsFromRows([['*', '8', '25'], ['gp', '5', '15'], ['BAD CODE', '5', '5'], ['WALTONHIL', 'x', '20'], []]);
  assert.deepEqual(s, { default: { stopPct: 8, targetPct: 25 }, perCode: { GP: { stopPct: 5, targetPct: 15 } } });
  assert.deepEqual(settingsFromRows(settingsToRows(s)), s);
  assert.deepEqual(settingsFromRows([]).default, { stopPct: 10, targetPct: 20 });
});

test('settings from the API are checked; one bad value rejects the whole save', () => {
  assert.deepEqual(parseSettings({ default: { stopPct: 10, targetPct: 20 }, perCode: { gp: { stopPct: 7, targetPct: 15 } } }), { default: { stopPct: 10, targetPct: 20 }, perCode: { GP: { stopPct: 7, targetPct: 15 } } });
  assert.equal(parseSettings({ default: { stopPct: 10, targetPct: 20 }, perCode: { GP: { stopPct: 0, targetPct: 15 } } }), null);
  assert.equal(parseSettings({ default: { stopPct: 10, targetPct: 20 }, perCode: { '<x>': { stopPct: 5, targetPct: 15 } } }), null);
  assert.equal(parseSettings(null), null);
});

test('reasons tell the truth: past target but not priced high, no double negative, no limit claim without a price', () => {
  assert.ok(check({ price: 130, zone: 'middle' }).reasons.some((r) => /past your 20% target, but the price is not high/.test(r)));
  assert.ok(check({ signal: 'research', verdictKey: 'value', price: 95, weightPct: 10 }).reasons.includes('5.0% below your average cost'));
  assert.ok(!check({ price: null }).reasons.some((r) => /not reached/.test(r)));
});

test('booleans and arrays are not numbers for limits', () => {
  assert.equal(validLimits({ stopPct: true, targetPct: 20 }), null);
  assert.equal(validLimits({ stopPct: [5], targetPct: 20 }), null);
  assert.equal(validLimits({ stopPct: ' ', targetPct: 20 }), null);
});

const GP_DECL = [
  { recordDate: '2026-12-10', cashPct: 50 },
  { recordDate: '2026-08-12', cashPct: 105, interim: true },
  { recordDate: '2026-03-03', cashPct: 105 },
];
const trade = (date: string, side: 'BUY' | 'SELL', quantity: number) => ({ id: date + side, date, code: 'GP', side, quantity, price: 260, commission: null, note: '', source: 'manual', createdAt: '' });
const TODAY = '2026-11-24';

test('dividends count only record dates after the buy and up to today', () => {
  // GP 100 shares bought 10 Mar 2026: the 3 Mar record date is before it, the 10 Dec one is still ahead.
  assert.equal(dividendsReceived([trade('2026-03-10', 'BUY', 100)], 'GP', GP_DECL, 10, TODAY), 1050);
  assert.equal(dividendsReceived([trade('2026-03-01', 'BUY', 100)], 'GP', GP_DECL, 10, TODAY), 2100);
  assert.equal(dividendsReceived([trade('2026-03-10', 'BUY', 100)], 'ROBI', GP_DECL, 10, TODAY), 0);
});

test('dividends use the shares held on each record date (partial sells, more buys)', () => {
  const trades = [trade('2026-09-01', 'BUY', 10), trade('2026-03-01', 'BUY', 100), trade('2026-05-01', 'SELL', 40), trade('2026-08-12', 'BUY', 50)];
  // 3 Mar: 100 shares; 12 Aug: 60 (a buy on the record date itself is too late).
  assert.equal(dividendsReceived(trades, 'GP', GP_DECL, 10, TODAY), 1050 + 630);
  // A sell of more than was held never takes the count below zero.
  assert.equal(dividendsReceived([trade('2026-02-01', 'SELL', 10), trade('2026-03-01', 'BUY', 5)], 'GP', GP_DECL, 10, TODAY), 105);
});

test('dividends use the last cum day when the declaration has one', () => {
  const decl = [{ recordDate: '2026-08-12', lastBuyDate: '2026-08-10', cashPct: 105 }];
  // A buy after the last cum day is too late; a sell after it still gets the dividend.
  assert.equal(dividendsReceived([trade('2026-08-11', 'BUY', 100)], 'GP', decl, 10, TODAY), 0);
  assert.equal(dividendsReceived([trade('2026-08-10', 'BUY', 100), trade('2026-08-11', 'SELL', 100)], 'GP', decl, 10, TODAY), 1050);
});

test('break-even after the sell commission, and the move needed from today', () => {
  assert.equal(breakEvenPrice(261.04, 0.4), 262.09);
  assert.equal(breakEvenPrice(100, 0), 100);
  assert.equal(((breakEvenPrice(261.04, 0.4) / 226.8 - 1) * 100).toFixed(1), '15.6');
});
