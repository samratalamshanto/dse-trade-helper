import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cagr, financialTrends } from '../src/trends.ts';

const years = [
  { year: 2023, eps: 20, nav: 40, profit: 1000, dividend: '100.00' as unknown as number },
  { year: 2021, eps: 10, nav: 20, profit: 500, dividend: 50 },
  { year: 2022, eps: null, nav: 30, profit: null, dividend: 80 },
];

test('cagr needs two positive ends at least one year apart', () => {
  assert.equal(cagr(100, 121, 2)?.toFixed(6), '10.000000');
  assert.equal(cagr(0, 121, 2), null);
  assert.equal(cagr(-5, 121, 2), null);
  assert.equal(cagr(100, 121, 0), null);
});

test('financialTrends sorts by year, skips missing inputs and computes ROE and payout', () => {
  const t = Object.fromEntries(financialTrends(years, 10).map((x) => [x.key, x]));
  assert.deepEqual(t.profit.points, [{ year: 2021, value: 500 }, { year: 2023, value: 1000 }]);
  assert.equal(t.profit.span, 2);
  assert.equal(t.profit.cagr?.toFixed(2), '41.42');
  assert.deepEqual(t.nav.points.map((p) => p.year), [2021, 2022, 2023]);
  assert.deepEqual(t.roe.points, [{ year: 2021, value: 50 }, { year: 2023, value: 50 }]);
  // 2023: 100% of ৳10 face value = ৳10 cash per share ÷ ৳20 EPS = 50%
  assert.deepEqual(t.payout.points, [{ year: 2021, value: 50 }, { year: 2023, value: 50 }]);
  assert.equal(t.roe.cagr, null);
  assert.equal(t.payout.cagr, null);
});

test('EPS is divided by later bonus shares and the change uses the shared 5-year rule', () => {
  const t = Object.fromEntries(financialTrends(years, 10, [{ year: 2022, stock: 100 }]).map((x) => [x.key, x]));
  assert.deepEqual(t.eps.points, [{ year: 2021, value: 5 }, { year: 2023, value: 20 }]);
  assert.equal(t.eps.change?.kind, 'cagr');
  assert.equal(t.eps.change?.value.toFixed(2), '100.00');
  assert.equal(t.roe.change?.kind, 'pp');
});

test('payout is skipped without a face value, and a single year has no CAGR', () => {
  const t = Object.fromEntries(financialTrends([years[0]], null).map((x) => [x.key, x]));
  assert.deepEqual(t.payout.points, []);
  assert.equal(t.eps.cagr, null);
  assert.equal(t.eps.span, 0);
});
