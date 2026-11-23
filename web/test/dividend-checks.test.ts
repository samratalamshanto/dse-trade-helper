import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntil, dividendChecks, dividendPerTenK, paidFromProfit, paidYears, passCount, perTenK, rangePos, yieldVsUsual, type DividendInput } from '../lib/dividend-checks.ts';

const base: DividendInput = { price: 100, yieldPct: 6, yearlyCashPerShare: 6, eps: 8, avgYieldPct: 4, paidYears: 5, fraud: 'clean', weekLow52: 80, weekHigh52: 140 };
const states = (r: DividendInput) => Object.fromEntries(dividendChecks(r).map((c) => [c.key, c.state]));

test('per ৳10,000: yearly cash from the 12-month yield, and cash from one dividend', () => {
  assert.equal(perTenK(6), 600);
  assert.equal(perTenK(9.34), 934);
  assert.equal(perTenK(0), 0);
  assert.equal(perTenK(null), null);
  assert.equal(dividendPerTenK(21, 224.8), 934);
  assert.equal(dividendPerTenK(null, 100), null);
  assert.equal(dividendPerTenK(2, 0), null, 'no price gives no figure');
  assert.equal(dividendPerTenK(2, null), null);
});

test('52-week position: low = 0, high = 1; missing or flat range is not known', () => {
  assert.equal(rangePos(80, 80, 140), 0, 'price at the low exactly is a known position');
  assert.equal(rangePos(140, 80, 140), 1);
  assert.equal(rangePos(110, 80, 140), 0.5);
  assert.equal(rangePos(100, null, 140), null);
  assert.equal(rangePos(100, 80, null), null);
  assert.equal(rangePos(null, 80, 140), null);
  assert.equal(rangePos(100, 100, 100), null, 'a flat range tells nothing');
});

test('yield vs usual and paid from profit', () => {
  assert.equal(yieldVsUsual(6, 4), 2);
  assert.equal(yieldVsUsual(3.2, 4.5), -1.3);
  assert.equal(yieldVsUsual(6, null), null);
  assert.equal(yieldVsUsual(null, 4), null);
  assert.equal(paidFromProfit(6, 8), 75);
  assert.equal(paidFromProfit(12, 8), 150);
  assert.equal(paidFromProfit(6, null), null);
  assert.equal(paidFromProfit(6, -1), null, 'a loss gives no ratio');
  assert.equal(paidFromProfit(null, 8), null);
  assert.equal(paidFromProfit(0, 8), null, 'no cash dividend gives no ratio');
});

test('paid years: cash years in the last 5, stock-only and old years do not count', () => {
  const divs = [{ year: 2025, cash: 10 }, { year: 2024, cash: 0, }, { year: 2023, cash: 5 }, { year: 2022, cash: null }, { year: 2021, cash: 3 }, { year: 2020, cash: 9 }];
  assert.equal(paidYears(divs, 2025), 3);
  assert.equal(paidYears([], 2025), null, 'no history is not known');
});

test('days until the record date', () => {
  assert.equal(daysUntil('2026-11-24', '2026-11-25'), 1);
  assert.equal(daysUntil('2026-11-24', '2026-11-24'), 0);
  assert.equal(daysUntil('2026-11-24', '2026-12-24'), 30);
  assert.equal(daysUntil('2026-11-24', '2026-11-20'), null, 'passed');
  assert.equal(daysUntil('2026-11-24', null), null);
});

test('five checks: all pass', () => {
  assert.deepEqual(states(base), { yield: 'pass', profit: 'pass', years: 'pass', warning: 'pass', range: 'pass' });
  assert.equal(passCount(dividendChecks(base)), 5);
});

test('five checks: each fails on its own rule', () => {
  assert.deepEqual(states({ ...base, yieldPct: 4.99, yearlyCashPerShare: 9, paidYears: 3, fraud: 'suspicious', price: 110 }),
    { yield: 'fail', profit: 'fail', years: 'fail', warning: 'fail', range: 'fail' });
  assert.equal(states({ ...base, yieldPct: 5 }).yield, 'pass', 'exactly 5% passes');
  assert.equal(states({ ...base, yearlyCashPerShare: 8 }).profit, 'pass', 'exactly 100% payout passes');
  assert.equal(states({ ...base, paidYears: 4 }).years, 'pass');
  assert.equal(states({ ...base, price: 80 }).range, 'pass', 'at the low');
  const loss = dividendChecks({ ...base, eps: -2 }).find((c) => c.key === 'profit')!;
  assert.equal(loss.state, 'fail');
  assert.match(loss.text, /loss/);
});

test('five checks: missing data is not known, never a fail', () => {
  const none: DividendInput = { price: null, yieldPct: null, yearlyCashPerShare: null, eps: null, avgYieldPct: null, paidYears: null, fraud: null, weekLow52: null, weekHigh52: null };
  const checks = dividendChecks(none);
  assert.deepEqual(checks.map((c) => c.state), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown']);
  assert.equal(passCount(checks), 0);
  assert.equal(states({ ...base, eps: null }).profit, 'unknown');
  assert.equal(states({ ...base, yearlyCashPerShare: 0 }).profit, 'unknown', 'no cash paid is not a pass');
  assert.equal(states({ ...base, yearlyCashPerShare: 0, eps: -1 }).profit, 'unknown', 'a loss year with no dividend is not a fail either');
  assert.equal(states({ ...base, weekLow52: 100, weekHigh52: 100 }).range, 'unknown');
});

test('check wording stays neutral: no advice words', () => {
  const all = [base, { ...base, yieldPct: 1, eps: -1, paidYears: 0, fraud: 'high', price: 139 }].flatMap((r) => dividendChecks(r).map((c) => c.text));
  for (const t of all) assert.doesNotMatch(t, /\b(buy|sell|avoid|fraud|worth|profit-taking|take profit)\b/i);
});
