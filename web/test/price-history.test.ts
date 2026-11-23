import { test } from 'node:test';
import assert from 'node:assert';
import { cashInWindow, oneYearChange, priceHistory, yearAgoClose } from '../lib/price-history.ts';

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const series = (prices: number[]) => prices.map((price, i) => ({ date: day(i), price, volume: 100, open: price, high: price + 1, low: price - 1, trades: 5 }));

test('finds the rise and the fall of at least 10%, and the end of the last swing', () => {
  // 100 → 130 (rise 30%), → 104 (fall 20%), → 110 (still open, 5.8%: below the 10% bar, so part of the fall)
  const h = priceHistory(series([100, 110, 120, 130, 120, 110, 104, 110]))!;
  assert.deepStrictEqual(h.swings.map((s) => [s.kind, s.fromPrice, s.toPrice]), [['rise', 100, 130], ['fall', 130, 104]]);
  assert.strictEqual(h.high.price, 130);
  assert.strictEqual(h.low.price, 100);
  assert.deepStrictEqual([h.dayHigh.price, h.dayLow.price], [131, 99], 'intraday high and low come from the daily high/low');
  assert.strictEqual(h.changePct, null, 'under a year of data: no 1-year change, like metrics.change1y');
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

// Real trading days (Sunday to Thursday) from `start`, one per price.
function tradingSeries(start: string, prices: number[], extra: Partial<{ volume: number; trades: number }> = {}) {
  const out = [];
  for (let d = new Date(start + 'T00:00:00Z'), i = 0; i < prices.length; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 5 || d.getUTCDay() === 6) continue;
    const p = prices[i++];
    out.push({ date: d.toISOString().slice(0, 10), price: p, volume: 100, open: p, high: p + 1, low: p - 1, trades: 5, ...extra });
  }
  return out;
}

test('the 52-week window keeps only points within 365 days of the last date, and changePct is last close vs the close a year back', () => {
  // GP-like: 300 trading days (about 14 months); an old high of 300 sits 13 months back.
  const prices = Array.from({ length: 300 }, (_, i) => (i === 5 ? 300 : 250 - i * 0.1));
  const s = tradingSeries('2025-09-21', prices);
  const h = priceHistory(s)!;
  const last = s.at(-1)!.date, cut = new Date(Date.parse(last) - 365 * 86_400_000).toISOString().slice(0, 10);
  assert.ok(h.from >= cut, `${h.from} >= ${cut}`);
  assert.ok(h.high.price < 300, 'the 13-month-old high is outside the window');
  const base = [...s].reverse().find((p) => p.date <= cut)!;
  assert.strictEqual(h.changePct!.toFixed(4), (((s.at(-1)!.price - base.price) / base.price) * 100).toFixed(4));
  assert.strictEqual(yearAgoClose(s)?.date, base.date);
  assert.strictEqual(yearAgoClose(s.slice(-100)), null, 'under a year of data has no 1-year base');
  assert.strictEqual(priceHistory(s.slice(-100))!.changePct, null, '100 days: no 1-year change');
  assert.strictEqual(priceHistory(s.map((p) => ({ ...p, volume: 0, trades: 0 })))!.changePct, null, 'no trades in the window: no change');
});

test('an ex-dividend / bonus day is back-adjusted, not a crash: BRACBANK 15% cash + 15% bonus', () => {
  // Record date Sunday 17 May 2026; ex-date the next trading day. Raw close falls 77.3 → 66.0 (−14.6%), beyond the 10% circuit.
  const s = tradingSeries('2026-05-03', [77, 77.2, 77.3, 77.3, 77.1, 77.3, 66.0, 66.2, 66.5]);
  const rec = s[5].date;
  const raw = priceHistory(s)!;
  assert.ok(raw.worstDays[0].pct < -10, 'without declarations the ex-day reads as a crash');
  const h = priceHistory(s, [{ cashPct: 15, stockPct: 15, recordDate: rec }], 10)!;
  assert.deepStrictEqual(h.exDates, [{ date: s[6].date, recordDate: rec, cashPct: 15, stockPct: 15 }]);
  // (77.3 − 1.5) / 77.3 / 1.15 → expected ex price 65.91; 66.0 is a +0.1% day.
  const ex = h.bestDays.find((d) => d.date === s[6].date) ?? h.worstDays.find((d) => d.date === s[6].date);
  assert.ok(ex && Math.abs(ex.pct) < 1, `ex-day move ${ex?.pct}`);
  assert.ok(h.worstDays.every((d) => d.pct > -10));
  assert.strictEqual(h.high.price, 77.3, 'the 52-week high stays the raw traded price');
  assert.strictEqual(h.worstDays.find((d) => d.date === s[6].date)?.close ?? h.bestDays.find((d) => d.date === s[6].date)?.close, 66, 'shown closes are raw');
});

test('a cash dividend only (GP ৳10.50) adjusts by (P − cash) / P; a "no dividend" or a record date outside the series adjusts nothing', () => {
  const s = tradingSeries('2026-03-01', [262, 262, 262, 251.5, 251.5]);
  const h = priceHistory(s, [{ cashPct: 105, recordDate: s[2].date }], 10)!;
  assert.strictEqual(h.exDates.length, 1);
  assert.strictEqual(h.worstDays.length, 0, '262 − 10.50 = 251.50: no fall at all');
  assert.strictEqual(priceHistory(s, [{ noDividend: true, recordDate: s[2].date }], 10)!.exDates.length, 0);
  assert.strictEqual(priceHistory(s, [{ cashPct: 105, recordDate: '2020-01-01' }], 10)!.exDates.length, 0);
});

test('zero-trade days (volume 0 and trades 0) are not trading days', () => {
  const s = tradingSeries('2026-03-01', [100, 101, 102, 103]);
  s.splice(2, 0, { ...s[1], date: '2026-03-03', price: 101, volume: 0, trades: 0 });
  s.sort((a, b) => a.date.localeCompare(b.date));
  const h = priceHistory(s)!;
  assert.strictEqual(h.noTradeDays, 1);
  assert.strictEqual(h.days, 4);
  assert.strictEqual(h.upDays + h.downDays, 3);
  assert.strictEqual(h.longestUp?.days, 3);
  assert.strictEqual(h.illiquid, false);
});

test('a share with no trades in the window is illiquid, with no moves and the last trade date kept', () => {
  const old = tradingSeries('2024-06-02', [215, 215.5]);
  const flat = tradingSeries('2025-11-02', Array(40).fill(215.5), { volume: 0, trades: 0 });
  const h = priceHistory([...old, ...flat])!;
  assert.strictEqual(h.illiquid, true);
  assert.strictEqual(h.lastTradeDate, old.at(-1)!.date);
  assert.deepStrictEqual([h.days, h.bestDays.length, h.worstDays.length, h.swings.length, h.months.length, h.longestUp], [0, 0, 0, 0, 0, null]);
  assert.strictEqual(h.noTradeDays, 40);
});

test('since 1 Jan, 5% swings and partial edge months', () => {
  const s = tradingSeries('2025-12-14', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 106, 112, 108, 104]);
  const h = priceHistory(s)!;
  const lastDec = [...s].reverse().find((p) => p.date < '2026-01-01')!;
  assert.strictEqual(h.sinceJan, ((104 - lastDec.price) / lastDec.price) * 100);
  assert.strictEqual(h.swings.length, 1, 'the 12% rise only, at 10%');
  assert.deepStrictEqual(h.swingsSmall.map((x) => x.kind), ['rise', 'fall']);
  assert.strictEqual(priceHistory(tradingSeries('2026-02-01', [100, 101]))!.sinceJan, null, 'no close in the previous year');
  // The series starts 14 Dec and ends early January: both edge months are cut short.
  assert.deepStrictEqual(h.months.map((m) => m.partial), [true, true]);
  const full = tradingSeries('2026-01-01', Array(21).fill(100));
  assert.strictEqual(priceHistory(full)!.months.at(-1)!.partial, false, 'January ends on its last trading day');
});

test('cash in the window: record date after the year-ago close and on or before the last day, one per record date', () => {
  const decls = [
    { recordDate: '2025-11-20', cashPct: 50 }, // on the year-ago day: before the window
    { recordDate: '2026-03-03', cashPct: 105 },
    { recordDate: '2026-03-03', cashPct: 105 }, // same notice twice
    { recordDate: '2026-08-12', cashPct: 105, interim: true },
    { recordDate: '2026-09-01', stockPct: 10 }, // bonus shares are not cash
    { recordDate: '2026-10-01', noDividend: true, cashPct: 5 },
    { recordDate: '2026-12-01', cashPct: 40 }, // after the last day
  ];
  assert.strictEqual(cashInWindow(decls, '2025-11-20', '2026-11-19', 10), 21);
});

test('1-year total return adds the cash dividends to the price change (GP: price −17.3%, with ৳21 cash −9.6%)', () => {
  const pts = Array.from({ length: 300 }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 1) + i * 1.5 * 86_400_000).toISOString().slice(0, 10), price: 274, volume: 100, trades: 5 }));
  pts[pts.length - 1].price = 226.7;
  const decls = [{ recordDate: '2026-08-12', cashPct: 105, interim: true }, { recordDate: '2026-03-03', cashPct: 105 }];
  const h = priceHistory(pts, decls, 10)!;
  assert.strictEqual(h.dividendCash, 21);
  assert.strictEqual(h.changePct!.toFixed(1), '-17.3');
  assert.strictEqual(h.totalReturnPct!.toFixed(1), '-9.6');
  assert.strictEqual(priceHistory(pts, decls, 10, 230)!.changePct!.toFixed(1), '-16.1', 'a live price replaces the last close');
  assert.strictEqual(oneYearChange(pts, 230)!.yearAgo.price, 274);
  assert.strictEqual(priceHistory(pts, [{ recordDate: pts.at(-1)!.date.replace(/^\d{4}/, (y) => String(Number(y) - 2)), cashPct: 105 }], 10)!.totalReturnPct, h.changePct, 'an old record date adds nothing');
});
