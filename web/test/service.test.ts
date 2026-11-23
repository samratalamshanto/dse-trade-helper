import test, { type TestContext } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listCompanies, companyDetail, dashboard } from '../lib/service.ts';
import { respond } from '../lib/http.ts';
import { UpstreamError } from '../lib/dse.ts';
import { NotFoundError, allCompanies, newest, type StoredCompany } from '../lib/store.ts';
import { DATA_VERSION } from '../lib/company.ts';
import { real } from './real-companies.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dse-service-'));
fs.mkdirSync(path.join(dir, 'data'));
const stored = (code: 'GP' | 'HWAWELLTEX', extra: object = {}) => ({ ...real(code), version: 3, fetchedAt: Date.now(), ...extra });
const copies = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`GP${i}`, { ...stored('GP'), code: `GP${i}` }]));
fs.writeFileSync(path.join(dir, 'data', 'companies.json'), JSON.stringify({
  HWAWELLTEX: stored('HWAWELLTEX', { sector: '—' }), GP: stored('GP', { loanStatus: { shortTerm: 7000, longTerm: '$undefined' } }), ...copies,
}));
process.chdir(dir);

const cols = ['code', 'ltp', 'ycp', 'percent', 'trades', 'assetType', 'sector'];
const snap = {
  market: { indices: [{ key: 'DSEX', value: 5000, change: 1, percent: 0.1 }], totals: { trades: 1000, volume: 1, turnover: 1, marketCap: 1, tradeTime: 'Nov 19, 2026 at 2:40 PM' },
    breadth: { advanced: 1, declined: 1, unchanged: 1 }, dailyTotals: [] },
  prices: { cols, rows: [['HWAWELLTEX', 50.8, 47.8, 6.3, 900, 'EQ', 'Textile'], ['GP', 226.7, 226.8, -0.04, 800, 'EQ', 'Telecom'], ...Object.keys(copies).map((c) => [c, 226.7, 226.8, 0, 10, 'EQ', 'Telecom'])],
    session: { isOpen: false, sessionDate: '2026-11-19', date: '2026-11-20' } },
};

let snapshotUp = false;
let companyFetches = 0;
let companyMode: 'fail' | 'hang' | 'scan' = 'fail';
const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
test.beforeEach((ctx) => {
  const { mock } = ctx as TestContext;
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  mock.method(globalThis, 'fetch', (url: string) => {
    if (url.includes('/api/live/snapshot')) return snapshotUp ? reply(snap) : Promise.reject(new TypeError('fetch failed'));
    if (url.includes('/company/')) {
      companyFetches++;
      const failed = new TypeError('fetch failed');
      // In 'scan' mode GP0 answers 404 (a delisted code) and GP1 answers a real page; the rest still fail.
      if (companyMode === 'scan' && url.endsWith('/GP0')) return Promise.resolve(new Response('', { status: 404 }));
      if (companyMode === 'scan' && url.endsWith('/GP1')) return Promise.resolve(new Response('{"company":{"code":"GP1","name":"GP1","sector":"Telecom","category":"A"}}'));
      return companyMode === 'hang' ? new Promise((_, no) => setTimeout(() => no(failed), 1500)) : Promise.reject(failed);
    }
    return Promise.resolve(new Response('', { status: 404 }));
  });
});

test('A14: when the DSE list cannot be read, an unknown code is never sent to DSE', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() - 3_600_000 });
  await assert.rejects(companyDetail('NEWCO', false), UpstreamError);
  assert.strictEqual(companyFetches, 0);
});

test('H1: the stale scan skips codes DSE fails on and still refreshes the codes after them', async () => {
  snapshotUp = true;
  companyMode = 'scan';
  await listCompanies();
  for (let i = 0; i < 50 && allCompanies().GP1.version !== DATA_VERSION; i++) await new Promise((r) => setTimeout(r, 20));
  companyMode = 'fail';
  assert.strictEqual(allCompanies().GP1.version, DATA_VERSION);
  assert.notStrictEqual(allCompanies().GP0.version, DATA_VERSION);
});

test('A17/A16/A19: the list row and the company page agree for the same stored company', async () => {
  snapshotUp = true;
  const row = (await listCompanies()).rows.find((r) => r.code === 'HWAWELLTEX')!;
  const d = await companyDetail('HWAWELLTEX', false);
  assert.deepStrictEqual([d.analysis.signal, d.analysis.score, d.company.pe, d.company.dividendYield], [row.signal, row.score, row.pe, row.dividendYield]);
  assert.strictEqual(row.stale, true);
  // The list pill explains itself with the first 3 checks the company page shows as failed.
  assert.deepStrictEqual(row.missed, d.analysis.checks.filter((x) => !x.ok).map((x) => x.label).slice(0, 3));
  assert.ok(row.signal === 'research' || row.missed.length > 0);
  // The stored page had no sector ("—"); both take it from the live snapshot row.
  assert.deepStrictEqual([row.sector, d.company.sector], ['Textile', 'Textile']);
  // The snapshot still carries Thursday's ltp, but the market is closed: not live, and the session date says which day.
  assert.deepStrictEqual([d.today?.live, d.today?.sessionDate], [false, '2026-11-19']);
  assert.ok(Array.isArray(d.priceHistory?.exDates) && Array.isArray(d.dividendRecord));
  const gp = await companyDetail('GP', false);
  assert.deepStrictEqual(gp.company.loanStatus, { shortTerm: 7000, longTerm: null });
});

test('A18: a stored company is served at once while a newer copy loads in the background', async () => {
  companyMode = 'hang';
  const d = await Promise.race([companyDetail('GP3', false), new Promise((r) => setTimeout(() => r('waited'), 500))]);
  assert.notStrictEqual(d, 'waited');
  companyMode = 'fail';
});

test('A14/M2: ?fresh=1 stays inside the DSE budget, gets the headroom the scan leaves, and says when it was refused', async () => {
  const before = companyFetches;
  const skipped: boolean[] = [];
  for (const code of Object.keys(copies)) skipped.push((await companyDetail(code, true)).freshSkipped);
  assert.ok(companyFetches - before <= 20, `${companyFetches - before} fetches`);
  assert.ok(companyFetches > before, 'the scan must leave budget for user requests');
  assert.ok(skipped.at(-1), 'a refused fresh request is reported, not served as fresh');
});

test('A5: the dashboard date is the trading session, not today, while the market is closed', async () => {
  assert.strictEqual((await dashboard()).showingDate, '2026-11-19');
});

test('A3: a failed snapshot refresh serves the last good one instead of failing the dashboard', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 31_000 });
  snapshotUp = false;
  assert.strictEqual((await dashboard()).showingDate, '2026-11-19');
  snapshotUp = true;
});

test('A4: 404 for an unknown company, 502 for DSE failures, 500 for a fault in this app', async () => {
  const status = async (e: Error) => (await respond('t', async () => { throw e; })).status;
  assert.strictEqual(await status(new NotFoundError('x')), 404);
  assert.strictEqual(await status(new UpstreamError('DSE down')), 502);
  assert.strictEqual(await status(new TypeError('cannot read x of undefined')), 500);
});

test('A13: a store reload keeps, per code, the copy fetched last', () => {
  const at = (fetchedAt: number) => ({ fetchedAt }) as StoredCompany;
  const merged = newest({ A: at(5), B: at(5) }, { A: at(9), B: at(1), C: at(2) });
  assert.deepStrictEqual([merged.A.fetchedAt, merged.B.fetchedAt, merged.C.fetchedAt], [9, 5, 2]);
});
