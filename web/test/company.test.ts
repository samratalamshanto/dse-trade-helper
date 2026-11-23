import { test } from 'node:test';
import assert from 'node:assert';
import { parseCompanyPage, titleCaseName } from '../lib/company.ts';
import { todayTrading } from '../lib/service.ts';
import type { SnapshotRow } from '../lib/dse.ts';

const quote = { traded: true, lastPrice: 226.7, prevClose: 226.8, open: 226.8, high: 227.5, low: 226.3, close: 226.7, trades: 867, volume: 100838, valueMn: 22.87 };
const company = {
  code: 'GP', name: 'Grameenphone Ltd.', sector: 'Telecom', category: 'A', price: 226.7, isin: 'BD0001GP0004', freeFloat: 10.0, authorizedCapital: 40000,
  companySecretary: { name: 'S', email: 'cs@example.com' }, sessionQuote: quote,
  dividendHistory: [{ year: 2025, cash: 215, stock: 0, yieldPct: 8.34, rights: '1R:2' }, { year: 2024, cash: 330, stock: 0, yieldPct: 10.2, rights: '' }],
  multiYearFinancials: [{ year: 2025, epsBasic: 21.9, nav: 41.49, profit: 29576.54, pe: 11.77, epsBasicRestated: 20.1, oci: -489.59, dividendPct: '215.00' }],
  sharePattern: [],
};
const flight = JSON.stringify({ company, series: [{ date: '2026-11-19', price: 226.7, volume: 100838, open: 226.8 }],
  peTrend: [{ date: '18 Nov', audited: 10.36, unaudited: 10.58 }, { date: '19 Nov', audited: 10.35, unaudited: 10.57 }],
  interimFinancials: { periodEnds: { q1: '202603' }, rows: [{ metric: 'Earnings Per Share (EPS) Basic', q1: 4.9 }, { metric: 'Market price per share at period end', q1: 244 }] },
  recentAnnouncements: [] });
const page = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;

test('parser keeps every DSE company field, the extra year fields, rights, all quarterly rows and the P/E trend', () => {
  const c = parseCompanyPage(page);
  assert.ok(c);
  assert.strictEqual(c.details?.isin, 'BD0001GP0004');
  assert.strictEqual(c.details?.freeFloat, 10.0);
  assert.deepStrictEqual(c.details?.sessionQuote, quote);
  assert.strictEqual(c.details?.name, undefined, 'named fields are not stored twice');
  assert.strictEqual(c.details?.dividendHistory, undefined, 'arrays with their own place are not stored twice');
  assert.strictEqual(c.years[0].eps, 21.9);
  assert.strictEqual(c.years[0].epsBasicRestated, 20.1);
  assert.strictEqual(c.years[0].oci, -489.59);
  assert.deepStrictEqual(c.dividends.map((d) => d.rights), ['1R:2', null]);
  assert.strictEqual(c.interim?.rows?.length, 2);
  assert.strictEqual(c.peTrend?.length, 2);
});

const row = (ltp: number): SnapshotRow => ({ code: 'GP', ltp, ycp: 226.8, open: 226.8, high: 227.5, low: 226.3, close: 226.7, volume: 100838, value: 22.87, trades: 867, percent: 0, category: 'A', board: 'PUBLIC', sector: 'Telecom', assetType: 'EQ' });

const open = { isOpen: true, phase: 'open', tradingDay: true, sessionDate: '2026-11-19', opening: null, today: null, next: null, dataTime: null };

test('today trading comes from the live snapshot, and is live only while the market is open', () => {
  assert.deepStrictEqual(todayTrading(row(226.7), { sessionQuote: quote }, open),
    { open: 226.8, high: 227.5, low: 226.3, close: 226.7, prevClose: 226.8, volume: 100838, valueMn: 22.87, trades: 867, live: true, sessionDate: '2026-11-19' });
  // Saturday: DSE still sends Thursday's ltp, but nothing trades.
  const closed = todayTrading(row(226.7), { sessionQuote: quote }, { ...open, isOpen: false, phase: 'closed', tradingDay: false });
  assert.deepStrictEqual([closed?.live, closed?.sessionDate], [false, '2026-11-19']);
  assert.deepStrictEqual([todayTrading(row(226.7), {}, null, '2026-11-19')?.live, todayTrading(row(226.7), {}, null, '2026-11-19')?.sessionDate], [false, '2026-11-19']);
});

test('before the first trade (ltp 0) today trading falls back to the saved session quote, and is null with neither', () => {
  assert.strictEqual(todayTrading(row(0), { sessionQuote: quote })?.live, false);
  assert.strictEqual(todayTrading(row(0), { sessionQuote: quote })?.close, 226.7);
  assert.strictEqual(todayTrading(undefined, {}), null);
  assert.strictEqual(todayTrading(undefined, undefined), null);
  assert.strictEqual(todayTrading(undefined, { sessionQuote: 'bad' })?.close ?? null, null);
});

test('titleCaseName converts entirely-lowercase DSE names; leaves mixed-case unchanged', () => {
  // All-lowercase input is title-cased
  assert.strictEqual(titleCaseName('aamra networks limited'), 'Aamra Networks Limited');
  assert.strictEqual(titleCaseName('square pharmaceuticals ltd.'), 'Square Pharmaceuticals Ltd.');
  assert.strictEqual(titleCaseName('brac bank plc'), 'Brac Bank PLC');
  assert.strictEqual(titleCaseName('bsrm steels limited'), 'Bsrm Steels Limited');
  assert.strictEqual(titleCaseName('ific bank plc'), 'Ific Bank PLC');
  assert.strictEqual(titleCaseName('lafargeholcim'), 'Lafargeholcim');
  assert.strictEqual(titleCaseName('rak ceramics (bangladesh) limited'), 'Rak Ceramics (Bangladesh) Limited');
  assert.strictEqual(titleCaseName('x-y company'), 'X-Y Company');
  // Already mixed-case: returned unchanged
  assert.strictEqual(titleCaseName('BRAC Bank PLC'), 'BRAC Bank PLC');
  assert.strictEqual(titleCaseName('LafargeHolcim Bangladesh Limited'), 'LafargeHolcim Bangladesh Limited');
  assert.strictEqual(titleCaseName(''), '');
});
