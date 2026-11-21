import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changePct, crFromMn, dailyRows, detailGroups, detailText, emailLinks, exLabel, fmtDay, fmtMonth, fmtUpTo2, fmtWeekday, interimTable, isHttpUrl, isSafeLink, labelFromKey, phoneLinks, todayTitle, yearFields } from '../src/details.ts';

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
    sessionQuote: { open: 1 }, asOfTime: '14:09:56', paidUpShares: '1350300022', fiscalYear: '2025',
    phone: '02-9882990, +880 1711-000000, ext 12', email: 'ir@gp.com; info@gp.com', creditRating: '',
  });
  const row = (title: string, label: string) => groups.find((g) => g.title === title)!.rows.find((r) => r.label === label)!;
  assert.equal(row('Identifiers', 'Scrip code').value, '27001');
  assert.equal(row('Identifiers', 'Board').value, '—');
  assert.equal(row('Capital & float', 'Authorized capital').value, '৳4,000.00 cr');
  assert.equal(row('Capital & float', 'Free float').value, '10.01%');
  assert.match(row('Capital & float', 'Free float').hint!, /public can trade/);
  assert.equal(row('Identifiers', 'Credit rating').value, 'Not rated');
  assert.deepEqual(row('Contact', 'Phone').links!.map((l) => l.url), ['tel:029882990', 'tel:+8801711000000']);
  assert.deepEqual(row('Contact', 'Email').links!.map((l) => l.url), ['mailto:ir@gp.com', 'mailto:info@gp.com']);
  assert.deepEqual(groups.slice(0, 2).map((g) => g.title), ['Contact', 'Links']);
  assert.equal(row('Capital & float', 'Free-float market cap').value, '৳3,065 cr');
  assert.equal(row('Company secretary', 'Name').value, 'Mr. X');
  assert.equal(row('Company secretary', 'Mobile').value, '—');
  assert.equal(row('Links', 'Price-sensitive news').url, 'https://gp.com/psi');
  assert.equal(row('Links', 'Financial statements').url, null);
  assert.deepEqual(groups.at(-1), { title: 'Advanced: raw DSE fields', advanced: true, rows: [
    { label: 'As of time', value: '14:09:56', url: null }, { label: 'Paid up shares', value: '1,350,300,022', url: null }, { label: 'Fiscal year', value: '2025', url: null },
  ] });
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
  assert.deepEqual(dailyRows([
    { date: '2025-11-17', price: 190, volume: 5 },
    { date: '2026-11-18', price: 200, volume: 10 },
  ], '2025-11-18').map((r) => [r.date, Math.round(r.changePct!)]), [['2026-11-18', 5]], 'days before the window are left out; the first day keeps its change');
  assert.equal(changePct(0, 5), null);
  assert.equal(changePct(null, 5), null);
});

test('company status, dates and loans are grouped', () => {
  const g = detailGroups({ yearEnd: 'December', agmDate: '20-04-2026', operationalStatus: 'Active', loanStatus: { shortTerm: 7000, longTerm: null } });
  const rows = Object.fromEntries(g.find((x) => x.title === 'Status & dates')!.rows.map((r) => [r.label, r.value]));
  assert.deepEqual(rows, { 'Operational status': 'Active', 'Year end': 'December', 'Last AGM': '20-04-2026', 'Short-term loan': '৳700.00 cr', 'Long-term loan': '—' });
  assert.equal(g.some((x) => x.advanced), false);
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
    ['EPS', ['2019:25.56', '2018:26.04']], ['Dividend % (as listed)', ['2019:130.00', '2018:—']], ['newThing', ['2019:3', '2018:—']],
  ]);
});

test('yearly fields drop repeats of an earlier field and show money in crore', () => {
  const f = yearFields([
    { year: 2024, eps: 10, epsBasic: 10, epsBasicRestated: 9, profit: 12345, profitForYear: 12345 },
    { year: 2025, eps: 12, epsBasic: 12, epsBasicRestated: 12, profit: 15000, profitForYear: 15000 },
  ]);
  assert.deepEqual(f.map((x) => [x.key, x.values.map((v) => v.text).join(' ')]), [
    ['eps', '12 10'], ['epsBasicRestated', '12 9'], ['profit', '1,500.00 1,234.50'],
  ]);
  assert.equal(f.find((x) => x.key === 'profit')!.label, 'Net profit (৳ cr)');
  assert.match(f.find((x) => x.key === 'epsBasicRestated')!.hint!, /Recalculated/);
});

test('money in crore, percents keep up to 2 decimals', () => {
  assert.equal(crFromMn(1234.5), '৳123.45 cr');
  assert.equal(crFromMn(null), '—');
  assert.equal(fmtUpTo2(12.5), '12.5');
  assert.equal(fmtUpTo2(10), '10');
  assert.equal(fmtUpTo2(7.125), '7.13');
});

test('phone and email links are built only from real numbers and addresses', () => {
  assert.deepEqual(phoneLinks('PABX: 9882990, 123'), [{ label: 'PABX: 9882990', url: 'tel:9882990' }]);
  assert.deepEqual(phoneLinks('02-9882990 Ext. 12; 02-123456').map((l) => l.url), ['tel:029882990', 'tel:02123456']);
  assert.deepEqual(phoneLinks(null), []);
  assert.deepEqual(emailLinks('not an email'), []);
  for (const ok of ['tel:+8801711000000', 'mailto:ir@gp.com', 'https://gp.com']) assert.equal(isSafeLink(ok), true);
  for (const bad of ['tel:123;x', 'javascript:alert(1)', 'mailto:a b@c', 'mailto:a@b.com?cc=x@evil.com', 'mailto:?cc=x@evil.com']) assert.equal(isSafeLink(bad), false);
  assert.deepEqual(phoneLinks('880+1711000000, +880 1711-000000').map((l) => l.url), ['tel:8801711000000', 'tel:+8801711000000']);
  for (const l of phoneLinks('880+171 000, PABX: +880 2 9882990')) assert.equal(isSafeLink(l.url), true, l.url);
  assert.deepEqual(emailLinks('a@b.com?cc=x@evil.com'), [], 'mailto prefill is not a link');
  assert.deepEqual(emailLinks('ir@gp.com, <cs@gp.com.bd>').map((l) => l.url), ['mailto:ir@gp.com', 'mailto:cs@gp.com.bd']);
});

test('session card says today only while live', () => {
  assert.equal(fmtWeekday('2026-11-20'), 'Fri 20 Nov');
  assert.equal(todayTitle({ live: true, sessionDate: '2026-11-20' }), "Today's trading · Live");
  assert.equal(todayTitle({ live: false, sessionDate: '2026-11-20' }), 'Last session · Fri 20 Nov');
  assert.equal(todayTitle({ live: false }), 'Last session');
});

test('ex-dates name the kind and the record date', () => {
  assert.equal(exLabel({ date: '2026-05-04', recordDate: '2026-05-05', cashPct: 10, stockPct: 12.5 }), 'Ex-dividend (10% cash) · ex-bonus (12.5% bonus) · record date 5 May 2026');
  assert.equal(exLabel({ date: '2026-05-04' }), 'Ex-date');
});
