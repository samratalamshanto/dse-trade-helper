import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { fromRows, splitNew, toRow, tradesCsv, type Trade } from '../lib/trades.ts';
import { planCreatedAt } from '../lib/plans.ts';
import { readFirstSheet, XlsxError } from '../lib/xlsx.ts';
import { backupSummary, mergeData, parseBackup, toBackup, type MyData } from '../lib/backup.ts';

// No company cache here, so the valuation uses only the mocked live prices (company analysis fails and is skipped).
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'dse-browser-')));
const { valueTrades } = await import('../lib/trades-service.ts');
const { plansWithStatus, holdingFromParams } = await import('../lib/planner-service.ts');
const { accountFromBody, plansFromBody, settingsFromBody, tradesFromBody } = await import('../lib/browser-data.ts');
const { browserRoute, readJson, BROWSER_JSON_MAX_BYTES } = await import('../lib/trades-http.ts');
const { settingsFromRows } = await import('../lib/positions.ts');

const snap = {
  market: { indices: [], totals: { trades: 1, volume: 1, turnover: 1, marketCap: 1, tradeTime: '' }, breadth: { advanced: 0, declined: 0, unchanged: 0 }, dailyTotals: [] },
  prices: { cols: ['code', 'ltp', 'ycp', 'percent', 'trades', 'assetType', 'sector'], rows: [['GP', 280, 279, 0.3, 10, 'EQ', 'Telecom']], session: { isOpen: false } },
};
test.beforeEach((ctx) => {
  const { mock } = ctx as TestContext;
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  mock.method(globalThis, 'fetch', (url: string) => (url.includes('/api/live/snapshot') ? Promise.resolve(new Response(JSON.stringify(snap))) : Promise.reject(new TypeError('fetch failed'))));
});

const trade = (over: Partial<Trade>): Trade => ({ id: 't1', date: '2026-01-05', code: 'GP', side: 'BUY', quantity: 100, price: 250, commission: 50, note: '', source: 'manual', createdAt: '2026-01-05T04:00:00.000Z', account: 'real', ...over });
const TRADES = [
  trade({}),
  trade({ id: 't2', date: '2026-02-05', side: 'SELL', quantity: 40, price: 300, commission: 30, createdAt: '2026-02-05T04:00:00.000Z' }),
  trade({ id: 'p1', code: 'BXPHARMA', quantity: 5, price: 120, commission: null, account: 'paper' }),
];

test('the Sheet path and the browser path give the same valuation for the same trades', async () => {
  const settings = settingsFromRows([]);
  const fromSheet = await valueTrades(fromRows(TRADES.map(toRow), 'real').trades, settings, 'real');
  // Browser storage keeps numbers as numbers; the body path must read them exactly like sheet cells.
  const fromBrowser = await valueTrades(tradesFromBody(JSON.parse(JSON.stringify(TRADES)), 'real'), settingsFromBody(undefined), 'real');
  assert.deepEqual(fromBrowser, fromSheet);
  assert.equal(fromSheet.trades.length, 2, 'practice trades stay out of the real account');
  const gp = fromSheet.holdings[0];
  assert.deepEqual([gp.code, gp.shares, gp.price, gp.value], ['GP', 60, 280, 16800]);
  assert.ok(gp.check, 'every open holding gets a check');
});

test('browser bodies are refused with a plain reason when they are bad or too big', async () => {
  const bad: [() => unknown, RegExp][] = [
    [() => tradesFromBody('nope', 'real'), /as a list/],
    [() => tradesFromBody(Array.from({ length: 5001 }, (_, i) => trade({ id: `t${i}` })), 'real'), /at most 5000/],
    [() => tradesFromBody([trade({}), { ...trade({}), quantity: -1 }], 'real'), /Trade 2 is not valid/],
    [() => tradesFromBody([{ ...trade({}), id: '' }], 'real'), /Trade 1 is not valid/],
    [() => tradesFromBody([null], 'real'), /Trade 1 is not valid/],
    [() => plansFromBody(Array.from({ length: 501 }, () => ({}))), /at most 500/],
    [() => plansFromBody([{ id: 'x', code: 'GP', quantity: 0, createdAt: '' }]), /Plan 1 is not valid/],
    [() => settingsFromBody({ default: { stopPct: 0, targetPct: 20 } }), /between 1 and 95/],
    [() => accountFromBody('margin'), /real or paper/],
    [() => holdingFromParams(new URLSearchParams('shares=1.5&avgCost=1&portfolioValue=1')), /Shares held/],
    [() => holdingFromParams(new URLSearchParams('shares=1&avgCost=-1&portfolioValue=1')), /Average cost/],
    [() => holdingFromParams(new URLSearchParams('shares=1&avgCost=1&portfolioValue=x')), /Portfolio value/],
  ];
  for (const [run, msg] of bad) assert.throws(run, msg);
  assert.deepEqual(holdingFromParams(new URLSearchParams('shares=10&avgCost=120&portfolioValue=1200')), { shares: 10, avgCost: 120, portfolioValue: 1200 });
  assert.equal(holdingFromParams(new URLSearchParams('qty=1')), null);

  const big = new Request('http://x/api/portfolio/value', { method: 'POST', body: 'x'.repeat(BROWSER_JSON_MAX_BYTES + 1) });
  await assert.rejects(readJson(big, BROWSER_JSON_MAX_BYTES), /too large/);
  const r = await browserRoute(new Request('http://x/', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }), 'test', async () => ({}));
  assert.equal(r.status, 403);
  const refused = await browserRoute(new Request('http://x/', { method: 'POST' }), 'test', async () => tradesFromBody('nope', 'real'));
  assert.equal(refused.status, 400);
  assert.match(((await refused.json()) as { error: string }).error, /as a list/);
});

test('import in browser mode: a trade already saved in the browser cancels one identical row from the file', () => {
  const saved = [trade({})];
  const fromFile = [{ date: '2026-01-05', code: 'GP', side: 'BUY' as const, quantity: 100, price: 250, commission: null, note: 'from order summary', account: 'real' as const }];
  const { added, skipped } = splitNew([...fromFile, ...fromFile], saved);
  assert.equal(skipped.length, 1);
  assert.equal(added.length, 1, 'two identical rows in one file are two real trades');
});

test('plan status from browser data counts real buys since the plan day only', async () => {
  const plans = [{ id: 'p', code: 'GP', quantity: 50, boughtNow: 0, targetPrice: 270, until: null, note: '', status: 'active', createdAt: '2026-01-05T00:00:00.000Z' }];
  const trades = [trade({ quantity: 20 }), trade({ id: 'old', date: '2026-01-01', quantity: 7 }), trade({ id: 'pp', quantity: 9, account: 'paper' })];
  const { plans: out } = await plansWithStatus(plansFromBody(plans), tradesFromBody(trades, 'real'));
  assert.equal(out[0].boughtNow, 20);
  assert.equal(out[0].price, 280);
  assert.equal(out[0].live.status, 'waiting');
});

test('trades CSV keeps one row per trade and quotes commas', () => {
  const csv = tradesCsv([trade({ note: 'a, b' })]).split('\n');
  assert.equal(csv[0], 'id,date,code,side,quantity,price,commission,note,source,created_at,account');
  assert.equal(csv[1], 't1,2026-01-05,GP,BUY,100,250,50,"a, b",manual,2026-01-05T04:00:00.000Z,real');
});

test('trades CSV defuses cells that a spreadsheet would run as a formula', () => {
  const row = tradesCsv([trade({ id: '=HYPERLINK("x")', note: 'ok', source: '+1', createdAt: '@now' })]).split('\n')[1];
  assert.equal(row, `"'=HYPERLINK(""x"")",2026-01-05,GP,BUY,100,250,50,ok,'+1,'@now,real`);
});

test('a moved plan keeps its own created time unless it is missing, odd or in the future', () => {
  const now = Date.parse('2026-11-21T10:00:00Z');
  assert.equal(planCreatedAt('2026-11-01T03:00:00.000Z', now), '2026-11-01T03:00:00.000Z');
  for (const bad of [undefined, '', 'yesterday', '2026-11-30T00:00:00Z', '1999-01-01T00:00:00Z', 5]) assert.equal(planCreatedAt(bad, now), '2026-11-21T10:00:00.000Z', String(bad));
});

test('xlsx: an unclosed row bomb, a huge column ref and an oversize part are refused or cut short quickly', () => {
  const sheet = (xml: string) => zipSync({ 'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${xml}</sheetData></worksheet>`) });
  const started = Date.now();
  assert.deepEqual(readFirstSheet(sheet('<row>'.repeat(200_000))), []);
  assert.ok(Date.now() - started < 2000, 'linear scan');
  assert.throws(() => readFirstSheet(sheet('<row r="1"><c r="AAAAAA1"><v>1</v></c></row>')), XlsxError);
  assert.throws(() => readFirstSheet(sheet('<row/>'.repeat(20_001))), /more than 20000 rows/);
  assert.throws(() => readFirstSheet(zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(5_000_001) })), /too large inside/);
  assert.deepEqual(readFirstSheet(sheet('<rowBreaks count="1"/><row r="1"><c r="B1" t="inlineStr"><is><t>GP</t></is></c></row>')), [['', 'GP']]);
});

test('valuation skips codes not on the DSE list and says so once, without asking DSE about them', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', (url: string) => { calls.push(url); return url.includes('/api/live/snapshot') ? Promise.resolve(new Response(JSON.stringify(snap))) : Promise.reject(new TypeError('fetch failed')); });
  const out = await valueTrades([trade({}), trade({ id: 'z', code: 'NOSUCHCO' })], settingsFromRows([]), 'real');
  assert.equal(out.holdings.find((h) => h.code === 'NOSUCHCO')?.check, null);
  assert.equal(out.warnings.length, 1);
  assert.ok(!calls.some((u) => u.includes('NOSUCHCO')));
});

const data = (over: Partial<MyData> = {}): MyData => ({ trades: [], plans: [], limits: null, watchlist: [], alerts: { rules: [], fired: {}, history: [] }, ...over });
const planItem = { id: '11111111-1111-4111-8111-111111111111', code: 'GP', quantity: 10, boughtNow: 0, targetPrice: 222.2, until: null, note: '', status: 'active' as const, createdAt: '2026-01-01T00:00:00.000Z' };

test('backup: a file round-trips, and a wrong app, version, size or item is refused whole', () => {
  const full = data({ trades: [trade({})], plans: [planItem], limits: { default: { stopPct: 8, targetPct: 25 }, perCode: {} }, watchlist: ['GP', 'ACI'] });
  const parsed = parseBackup(JSON.stringify(toBackup(full)));
  assert.ok(parsed.ok);
  if (parsed.ok) assert.deepEqual(parsed.value, full);
  assert.equal(backupSummary(full), '1 trade, 1 plan, limits, 2 watchlist codes, 0 alerts');
  const bad: [string, RegExp][] = [
    ['not json', /not a Trade Helper backup/],
    [JSON.stringify({ ...toBackup(full), app: 'other' }), /not a Trade Helper backup/],
    [JSON.stringify({ ...toBackup(full), version: 2 }), /different version/],
    [JSON.stringify({ ...toBackup(full), trades: [trade({}), { ...trade({}), price: -1 }] }), /Trade 2 in this file is not valid/],
    [JSON.stringify({ ...toBackup(full), limits: { default: { stopPct: 0 } } }), /limits/],
    ['x'.repeat(3_000_001), /too large/],
  ];
  for (const [text, msg] of bad) { const r = parseBackup(text); assert.ok(!r.ok && msg.test(r.error), msg.source); }
});

test('backup add: known ids and identical trades are skipped, the rest is added; replace takes the file', () => {
  const here = data({ trades: [trade({})], watchlist: ['GP'] });
  const file = data({ trades: [trade({}), trade({ id: 'copy' }), trade({ id: 'new', code: 'ACI' })], plans: [planItem], watchlist: ['ACI', 'GP'] });
  const added = mergeData(here, file, 'add');
  assert.ok(added.ok);
  if (added.ok) {
    assert.deepEqual(added.value.trades.map((t) => t.id), ['t1', 'new']);
    assert.deepEqual(added.value.watchlist, ['GP', 'ACI']);
    assert.equal(added.value.plans.length, 1);
  }
  const replaced = mergeData(here, file, 'replace');
  assert.ok(replaced.ok && replaced.value.trades.length === 3);
});

test('a backup with the same trade id twice is refused', () => {
  const t = { id: '3de148c1-4441-4d2c-9cf0-b854cc2af085', date: '2026-11-21', code: 'GP', side: 'BUY', quantity: 1, price: 226.7, commission: null, note: '', account: 'real', source: 'manual', createdAt: '2026-11-21T09:00:00.000Z' };
  const r = parseBackup(JSON.stringify({ app: 'trade-helper', version: 1, trades: [t, { ...t, quantity: 2 }], plans: [] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /same trade or plan twice/);
});
