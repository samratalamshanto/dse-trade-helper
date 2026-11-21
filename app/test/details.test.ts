import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changePct, dailyRows, detailGroups, detailText, fmtDay, fmtMonth, interimTable, isHttpUrl, labelFromKey, yearFields } from '../src/details.ts';

test('only http and https links are openable', () => {
  assert.equal(isHttpUrl('https://www.grameenphone.com/ir'), true);
  assert.equal(isHttpUrl('http://x.com'), true);
  for (const bad of ['javascript:alert(1)', 'tel:123', 'file:///etc/passwd', 'www.x.com', '', null, 5, 'https://a b']) assert.equal(isHttpUrl(bad), false);
});

test('any DSE value becomes one line of text, missing shows a dash', () => {
  for (const x of [null, undefined, '', '  ', Number.NaN, [], {}]) assert.equal(detailText(x), '—');
  assert.equal(detailText(100838), '100,838');
  assert.equal(detailText(-0.10000000000002274), '-0.10');
  assert.equal(detailText(true), 'Yes');
  assert.equal(detailText({ lastPrice: 1.5, note: null }), 'Last price: 1.50 · Note: —');
  assert.equal(labelFromKey('freeFloatMarketCap'), 'Free float market cap');
});

test('details are grouped, formatted, and every unknown field is kept except the session quote', () => {
  const groups = detailGroups({
    isin: 'BD0001GP0004', scripCode: 27001, authorizedCapital: 40000, freeFloat: 10.007, freeFloatMarketCap: 30646454101.2,
    companySecretary: { name: 'Mr. X', cell: '' }, psiUrl: 'https://gp.com/psi', financialStatementsUrl: 'javascript:alert(1)',
    sessionQuote: { open: 1 }, asOfTime: '14:09:56',
  });
  const row = (title: string, label: string) => groups.find((g) => g.title === title)!.rows.find((r) => r.label === label)!;
  assert.equal(row('Identifiers', 'Scrip code').value, '27001');
  assert.equal(row('Identifiers', 'Board').value, '—');
  assert.equal(row('Capital & float', 'Authorized capital').value, '৳40,000.0 mn');
  assert.equal(row('Capital & float', 'Free float').value, '10.01%');
  assert.equal(row('Capital & float', 'Free-float market cap').value, '৳3,065 cr');
  assert.equal(row('Company secretary', 'Name').value, 'Mr. X');
  assert.equal(row('Company secretary', 'Mobile').value, '—');
  assert.equal(row('Links', 'Price-sensitive news').url, 'https://gp.com/psi');
  assert.equal(row('Links', 'Financial statements').url, null);
  assert.deepEqual(groups.at(-1), { title: 'Other fields from DSE', rows: [{ label: 'As of time', value: '14:09:56', url: null }] });
});

test('dates carry the year; bad input shows a dash', () => {
  assert.equal(fmtDay('2025-10-23'), '23 Oct 2025');
  assert.equal(fmtDay(null), '—');
  assert.equal(fmtMonth('2025-10'), 'Oct 2025');
  assert.equal(fmtMonth('2025-13'), '—');
});

test('daily rows are newest first with change against the previous close', () => {
  const rows = dailyRows([
    { date: '2026-11-18', price: 200, volume: 10, open: 199, high: 201, low: 198 },
    { date: '2026-11-19', price: 210, volume: 20 },
  ]);
  assert.deepEqual(rows.map((r) => [r.date, r.changePct, r.open]), [['2026-11-19', 5, null], ['2026-11-18', null, 199]]);
  assert.equal(changePct(0, 5), null);
  assert.equal(changePct(null, 5), null);
});

test('company status, dates and loans are grouped', () => {
  const g = detailGroups({ yearEnd: 'December', agmDate: '20-04-2026', operationalStatus: 'Active', loanStatus: { shortTerm: 7000, longTerm: null } });
  const rows = Object.fromEntries(g.find((x) => x.title === 'Status & dates')!.rows.map((r) => [r.label, r.value]));
  assert.deepEqual(rows, { 'Operational status': 'Active', 'Year end': 'December', 'Last AGM': '20-04-2026', 'Short-term loan': '৳7,000.0 mn', 'Long-term loan': '—' });
  assert.equal(g.some((x) => x.title === 'Other fields from DSE'), false);
});

test('interim table keeps every row and labels periods with their end month', () => {
  const t = interimTable({
    periods: { q1: '202603', half: '202606', q2: '202606' },
    eps: { metric: 'EPS' },
    rows: [{ metric: 'EPS Basic', q1: 4.9, q2: 5.62, half: 10.52 }, { metric: 'EPS Diluted', q1: null as unknown as number }, { metric: 'Price', q1: 244, annual: null }],
  })!;
  assert.deepEqual(t.columns.map((c) => c.label), ['Q1 (to Mar 2026)', 'Q2 (to Jun 2026)', 'Half year (to Jun 2026)', 'Year']);
  assert.deepEqual(t.rows.map((r) => [r.metric, ...r.values]), [
    ['EPS Basic', '4.90', '5.62', '10.52', '—'], ['EPS Diluted', '—', '—', '—', '—'], ['Price', '244', '—', '—', '—'],
  ]);
  assert.equal(interimTable(null), null);
  assert.equal(interimTable({ periods: {}, eps: { metric: 'EPS', q1: 1 } })!.rows[0].values[0], '1');
});

test('yearly fields keep only keys with a value, label known ones and keep raw unknown keys', () => {
  const f = yearFields([
    { year: 2019, eps: 25.56, reserve: null, dividendPct: '130.00', newThing: 3 },
    { year: 2018, eps: 26.04, reserve: '', dividendPct: null },
  ]);
  assert.deepEqual(f.map((x) => [x.label, x.values.map((v) => `${v.year}:${v.text}`)]), [
    ['EPS', ['2018:26.04', '2019:25.56']], ['Dividend % (as listed)', ['2018:—', '2019:130.00']], ['newThing', ['2018:—', '2019:3']],
  ]);
});
