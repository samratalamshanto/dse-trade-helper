import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CompanyRow, DividendSoon } from '../src/api.ts';
import { sparkPoints } from '../src/chart.ts';
import { catchableDividends, filterSort } from '../src/list.ts';

const row = (code: string, signal: CompanyRow['signal'], score: number, changePct: number | null): CompanyRow => ({
  code, name: `${code} Ltd`, sector: 'Bank', category: 'A', price: 10, changePct, signal, score, quality: false, fraud: 'clean', pe: 5, dividendYield: 1,
});
const rows = [row('BBB', 'caution', 40, 2), row('AAA', 'research', 90, -1), row('CCC', 'research', 80, null)];

test('filter by signal keeps only that signal', () => {
  assert.deepEqual(filterSort(rows, { query: '', signal: 'research', sort: 'name' }).map((r) => r.code), ['AAA', 'CCC']);
});

test('sort by score puts the best first', () => {
  assert.deepEqual(filterSort(rows, { query: '', signal: null, sort: 'score' }).map((r) => r.code), ['AAA', 'CCC', 'BBB']);
});

test('sort by change puts the top gainer first and missing changes last', () => {
  assert.deepEqual(filterSort(rows, { query: '', signal: null, sort: 'change' }).map((r) => r.code), ['BBB', 'AAA', 'CCC']);
});

test('search and filter combine, and the input list is not changed', () => {
  const before = rows.map((r) => r.code);
  assert.deepEqual(filterSort(rows, { query: 'ccc', signal: 'research', sort: 'score' }).map((r) => r.code), ['CCC']);
  assert.deepEqual(rows.map((r) => r.code), before);
});

const div = (code: string, lastBuyDate: string | null, fraud: DividendSoon['fraud'] = 'clean'): DividendSoon => ({
  code, name: code, sector: null, cashPct: 10, stockPct: null, yieldPct: 1, recordDate: null, lastBuyDate, fraud,
});

test('past, undated and weekend-only deadlines are hidden; clean first, then fewest trading days', () => {
  const rows = [div('LATE', '2026-11-19'), div('FRIDAY', '2026-11-20'), div('RISKY', '2026-11-23', 'high'), div('LATER', '2026-11-25'), div('SOON', '2026-11-22'), div('NODATE', null)];
  const friday = catchableDividends(rows, '2026-11-20');
  assert.deepEqual(friday.map((x) => [x.d.code, x.tradingDaysLeft]), [['SOON', 1], ['LATER', 4], ['RISKY', 2]]);
  const sunday = catchableDividends([div('TODAY', '2026-11-22')], '2026-11-22');
  assert.deepEqual(sunday.map((x) => [x.d.code, x.tradingDaysLeft, x.lastDayIsToday]), [['TODAY', 1, true]]);
});

test('chart points span the full width and flip y so higher values are higher up', () => {
  assert.equal(sparkPoints([1, 2, 3], 100, 10, 0), '0.0,10.0 50.0,5.0 100.0,0.0');
  assert.equal(sparkPoints([5], 100, 10), '');
  assert.equal(sparkPoints([2, 2], 10, 10, 0), '0.0,10.0 10.0,10.0');
});
