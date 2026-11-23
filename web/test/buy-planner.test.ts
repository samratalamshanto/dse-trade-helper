import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterBuying, BROKER_COMMISSION_PCT, sellEase, THIN_TRADING_BDT, moveFrequency, planBuy, position52, sma, todaysPicks, toTick, trendOf, type PlannerInput } from '../lib/buy-planner.ts';

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const series = (prices: number[]) => prices.map((price, i) => ({ date: day(i), price }));
const flat = (n: number, p = 100) => Array.from({ length: n }, () => p);
const wave = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i % 4 === 0 ? -3 : 0));

const base: PlannerInput = {
  code: 'GP', quantity: 10, price: 100, series: series(flat(80)), weekLow52: 80, weekHigh52: 120, signal: 'neutral', fraud: 'clean',
  zone: 'middle', faceValue: 10, dividend: null, agmDate: null, avgDailyValue: 50_000_000, holding: null, today: '2026-11-20',
};
const plan = (over: Partial<PlannerInput>) => planBuy({ ...base, ...over });

test('position, averages and tick rounding are exact', () => {
  assert.equal(position52(100, 80, 120), 0.5);
  assert.equal(position52(100, 120, 120), null);
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1, 2, 3, 4], 2, 1), 2.5);
  assert.equal(toTick(98.04), 98);
  assert.equal(toTick(222.166), 222.2);
});

test('move frequency counts both falls and rises within the window', () => {
  const m = moveFrequency([100, 97, 100, 103, 100, 100, 100, 100], 2, 2);
  assert.deepEqual([m.fell, m.rose], [33, 33]); // 6 days: falls after day 0 and 3, rises after day 1 and 2
  assert.deepEqual(moveFrequency([100], 2), { pct: 2, within: 5, fell: null, rose: null });
});

test('trend is falling only below both averages while the short average still slides', () => {
  const falling = Array.from({ length: 60 }, (_, i) => 160 - i);
  assert.equal(trendOf(falling, 99), 'falling');
  assert.equal(trendOf(Array.from({ length: 60 }, (_, i) => 100 + i), 161), 'rising');
  assert.equal(trendOf(flat(60), 100), 'sideways');
  assert.equal(trendOf(flat(10), 100), null);
});

test('high fraud risk or an Avoid signal says do not buy', () => {
  assert.equal(plan({ fraud: 'high' }).action, 'avoid');
  assert.equal(plan({ signal: 'avoid' }).buyNow, 0);
});

test('a dividend deadline within 10 trading days says buy before it, with the cash for your quantity', () => {
  const p = plan({ dividend: { lastBuyDate: '2026-11-23', cashPct: 105 } });
  assert.equal(p.action, 'buy-before-dividend');
  assert.match(p.reasons[0], /৳10\.50 a share \(৳105\.00 for 10\).*2 trading days left/);
});

test('at the top of its range it says wait, with an alert at the 20-day average', () => {
  const p = plan({ price: 118, series: series(flat(80, 105)) });
  assert.equal(p.action, 'wait');
  assert.equal(p.alertPrice, 105);
});

test('in a falling trend it splits (or waits for one share) instead of buying everything', () => {
  const sliding = series(Array.from({ length: 60 }, (_, i) => 160 - i));
  const p = plan({ price: 99, series: sliding, weekLow52: 90, weekHigh52: 170 });
  assert.equal(p.action, 'split');
  assert.deepEqual([p.buyNow, p.later, p.alertPrice], [5, 5, 97]);
  assert.equal(plan({ price: 99, series: sliding, weekLow52: 90, weekHigh52: 170, quantity: 1 }).action, 'wait');
});

test('near the 1-year low and not sliding it says buy now', () => {
  const p = plan({ price: 82, series: series(flat(80, 85)) });
  assert.equal(p.action, 'buy-now');
  assert.equal(p.buyNow, 10);
});

test('when a dip was more common than a rise it splits half now, half on an alert', () => {
  const p = plan({ series: series(wave(80)) });
  assert.equal(p.action, 'split');
  assert.equal(p.buyNow + p.later, 10);
});

test('after-buy average and concentration use your holding', () => {
  assert.deepEqual(afterBuying({ shares: 10, avgCost: 120, portfolioValue: 1000 }, 10, 100), { shares: 20, avgCost: 110, weightPct: 100 });
  // A mid-range split: 5 now at ৳100, 5 later at the ৳98 alert, so the new shares average ৳99 and the holding ৳109.50.
  const p = plan({ holding: { shares: 10, avgCost: 120, portfolioValue: 1200 } });
  assert.equal(p.action, 'split');
  assert.equal(p.avgPrice, 99);
  assert.equal(p.afterBuy?.avgCost, 109.5);
  assert.ok(p.warnings.some((w) => /concentrated/.test(w)));
});

test('thin trading and a large order are warned about', () => {
  assert.ok(plan({ avgDailyValue: 1_000_000 }).warnings.some((w) => /Thinly traded/.test(w)));
  assert.ok(plan({ avgDailyValue: 10_000, quantity: 100 }).warnings.some((w) => /normal day's trading/.test(w)));
});

test('no history never produces NaN', () => {
  const p = plan({ series: [], weekLow52: null, weekHigh52: null });
  assert.ok(!JSON.stringify(p).includes('NaN'));
  assert.equal(p.trend, null);
});

const pick = (code: string, over: Record<string, unknown> = {}) => ({ code, name: code, price: 100, signal: 'research', fraud: 'clean', score: 80, series: series(flat(60, 100)), weekLow52: 90, weekHigh52: 130, ...over });

test("today's picks: worth researching, clean, low in range, not sliding, affordable", () => {
  const rows = [pick('LOW'), pick('HIGH', { price: 125 }), pick('RISKY', { fraud: 'suspicious' }), pick('AVOID', { signal: 'caution' }), pick('DEAR', { price: 95, series: series(flat(60, 95)) })];
  const out = todaysPicks(rows, 99);
  assert.deepEqual(out.map((p) => [p.code, p.shares]), [['DEAR', 1]]);
  assert.deepEqual(todaysPicks(rows, null).map((p) => p.code), ['DEAR', 'LOW']);
});

test('with no holdings known the plan shows no share of holdings, and other holdings dilute the weight', () => {
  assert.equal(plan({}).afterBuy?.weightPct, null);
  assert.equal(afterBuying(null, 10, 100)?.weightPct, null);
  // ৳9,000 of other shares + ৳1,000 of this one: 10%, never 100%.
  assert.equal(afterBuying({ shares: 0, avgCost: 0, portfolioValue: 9000 }, 10, 100)?.weightPct, 10);
});

test('the plan adds the assumed broker commission on every planned lot', () => {
  const p = plan({ quantity: 1 });
  assert.equal(p.commissionPct, BROKER_COMMISSION_PCT);
  assert.equal(p.commission, 0.4);
  assert.equal(p.totalWithCommission, 100.4);
});

test('a share with no trades in 52 weeks is never a buy', () => {
  const p = plan({ illiquid: true });
  assert.equal(p.action, 'avoid');
  assert.equal(p.buyNow, 0);
  assert.ok(p.warnings.some((w) => /No trades in the last 52 weeks/.test(w)));
});

test('ease of selling: the planned shares at today\'s price as days of normal trading', () => {
  // 1,000 AMBEEPHA at ৳703.5 against ৳4,13,698 traded a day ≈ 1.7 days, and that is thin trading.
  const e = planBuy({ ...base, code: 'AMBEEPHA', quantity: 1000, price: 703.5, avgDailyValue: 413_698 }).sellEase!;
  assert.equal(e.days.toFixed(1), '1.7');
  assert.equal(e.thin, true);
  assert.deepEqual(sellEase(100_000, 50_000_000), { days: 0.002, thin: false });
  assert.equal(sellEase(100_000, THIN_TRADING_BDT - 1)!.thin, true);
  assert.equal(sellEase(100_000, null), null, 'no trading figure: no answer');
  assert.deepEqual(sellEase(100_000, 0), { days: Infinity, thin: true }, 'no trades in 20 days: the thinnest case, still marked');
  assert.equal(sellEase(0, 50_000_000), null);
});
