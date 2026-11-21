import { test } from 'node:test';
import assert from 'node:assert';
import { priceHistory } from '../lib/price-history.ts';

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const series = (prices: number[]) => prices.map((price, i) => ({ date: day(i), price, volume: 100, open: price, high: price + 1, low: price - 1, trades: 5 }));

test('finds the rise and the fall of at least 10%, and the end of the last swing', () => {
  // 100 → 130 (rise 30%), → 104 (fall 20%), → 110 (still open, 5.8%: below the 10% bar, so part of the fall)
  const h = priceHistory(series([100, 110, 120, 130, 120, 110, 104, 110]))!;
  assert.deepStrictEqual(h.swings.map((s) => [s.kind, s.fromPrice, s.toPrice]), [['rise', 100, 130], ['fall', 130, 104]]);
  assert.strictEqual(h.high.price, 130);
  assert.strictEqual(h.low.price, 100);
  assert.deepStrictEqual([h.dayHigh.price, h.dayLow.price], [131, 99], 'intraday high and low come from the daily high/low');
  assert.strictEqual(Math.round(h.changePct), 10);
});

test('small moves under 10% make no swing', () => {
  assert.deepStrictEqual(priceHistory(series([100, 103, 99, 104, 98]))!.swings, []);
});

test('a first fall is found when the series starts going down', () => {
  const h = priceHistory(series([100, 95, 88, 80, 90]))!;
  assert.deepStrictEqual(h.swings.map((s) => [s.kind, s.fromPrice, s.toPrice]), [['fall', 100, 80], ['rise', 80, 90]]);
});

test('streaks, best and worst days, and up/down counts', () => {
  const h = priceHistory(series([100, 101, 102, 103, 99, 98, 100]))!;
  assert.strictEqual(h.longestUp?.days, 3);
  assert.strictEqual(h.longestDown?.days, 2);
  assert.strictEqual(h.upDays, 4);
  assert.strictEqual(h.downDays, 2);
  assert.strictEqual(h.worstDays[0].close, 99);
  assert.ok(h.bestDays[0].pct > 0);
});

test('month rows use the previous month close as the base', () => {
  const pts = [{ date: '2026-01-30', price: 100, volume: 10 }, { date: '2026-01-31', price: 110, volume: 30 }, { date: '2026-02-01', price: 121, volume: 20 }];
  const m = priceHistory(pts)!.months;
  assert.deepStrictEqual(m.map((r) => [r.month, Math.round(r.changePct), r.avgVolume, r.trades]), [['2026-01', 10, 20, null], ['2026-02', 10, 20, null]]);
});

test('a high or low of 0 (no trade that day) falls back to the close', () => {
  const pts = [{ date: '2026-01-01', price: 100, volume: 0, high: 0, low: 0 }, { date: '2026-01-02', price: 105, volume: 5, high: 106, low: 104 }];
  const h = priceHistory(pts)!;
  assert.deepStrictEqual([h.months[0].high, h.months[0].low, h.dayHigh.price, h.dayLow.price], [106, 100, 106, 100]);
});

test('empty, single-point and zero prices give null', () => {
  assert.strictEqual(priceHistory([]), null);
  assert.strictEqual(priceHistory(series([100])), null);
  assert.strictEqual(priceHistory(series([0, 0])), null);
});
