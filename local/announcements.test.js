const test = require('node:test');
const assert = require('node:assert');
const { parseAnnouncements, dividendStatus, directorActivity, toIso, previousTradingDay } = require('./lib/announcements');
const { resolveRef } = require('./lib/company');

const NOW = new Date('2026-11-19');
const ann = (date, type, summary, body) => ({ date, type, summary, body });

test('toIso reads every DSE date style', () => {
  assert.deepStrictEqual(['16 Nov 2026', '16-Nov-2026', '16.11.2026', 'June 30, 2026', 'bad'].map(toIso),
    ['2026-11-16', '2026-11-16', '2026-11-16', '2026-06-30', null]);
});

test('reads a final declaration with record date, AGM and disbursement', () => {
  const e = parseAnnouncements([
    ann('21 Jan 2026', 'Dividend', 'Dividend Disbursement', 'The Company has informed that it has disbursed the Cash Dividend for the year ended June 30, 2025 to the respective shareholders.'),
    ann('23 Oct 2025', 'Dividend', 'Dividend Declaration and Others', 'The Board of Directors has recommended 120% Cash Dividend for the year ended June 30, 2025. Date of AGM: 15.12.2025, Time: 10:00 AM. Record Date: 16.11.2025.'),
  ]);
  assert.deepStrictEqual(e.declarations[0], { announced: '2025-10-23', cashPct: 120, stockPct: null, noDividend: false, interim: false, partial: false, eps: null,
    periodEnd: '2025-06-30', recordDate: '2025-11-16', agmDate: '2025-12-15', paidOn: '2026-01-21', lastBuyDate: '2025-11-13', lastBuyEstimated: true });
});

test('a final dividend that mentions an earlier interim stays final', () => {
  const [d] = parseAnnouncements([ann('06 Feb 2025', 'Dividend', 'Dividend Declaration',
    'The Board of Directors has declared Final Cash Dividend 150% i.e. BDT. 15 per share (i.e. Total Dividend 300% including Interim Cash Dividend 150% which was already paid in December 2024). Record Date: 26.02.2025. Date & Time of AGM: 25.03.2025 at 10:30 AM.')]).declarations;
  assert.deepStrictEqual([d.interim, d.cashPct, d.recordDate, d.agmDate], [false, 150, '2025-02-26', '2025-03-25']);
});

test('interim wording with the rate after the words, and a record date from a suspension notice', () => {
  const e = parseAnnouncements([
    ann('11 Aug 2026', 'Notice', 'Suspension for Record Date', 'Trading of the shares of the company will remain suspended on record date i.e., 12-Aug-2026.'),
    ann('15 Jul 2026', 'Dividend', 'Declaration of Interim Dividend', 'The Board has declared Interim Cash Dividend for the year 2026 at the rate of 105% of the paid-up capital.'),
  ]);
  assert.deepStrictEqual([e.declarations[0].interim, e.declarations[0].cashPct, e.declarations[0].recordDate], [true, 105, '2026-08-12']);
});

test('cash plus bonus shares and a sponsors-excluded dividend', () => {
  const e = parseAnnouncements([
    ann('29 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 0.20% Cash Dividend only for the General Shareholders except Sponsors and Directors for the year ended on June 30, 2026.'),
    ann('27 Apr 2026', 'Dividend', 'Dividend Declaration', 'The Board of Directors has recommended 15% cash and 15% stock dividend for the year ended December 31, 2025.'),
  ]);
  assert.deepStrictEqual(e.declarations.map((d) => [d.cashPct, d.stockPct, d.partial]), [[0.2, null, true], [15, 15, false]]);
});

test('dividend status finds an upcoming record date and the expected next month', () => {
  const e = parseAnnouncements([
    ann('29 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend for the year ended June 30, 2026. Record Date: 22.11.2026.'),
    ann('27 Oct 2025', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend for the year ended June 30, 2025. Record Date: 18.11.2025.'),
  ]);
  const s = dividendStatus(e, NOW);
  assert.strictEqual(s.upcoming.recordDate, '2026-11-22');
  assert.strictEqual(s.nextExpected, '2027-10');
  assert.strictEqual(s.regular, true);
});

test('director sells inside the last 180 days are counted, older ones are not', () => {
  const e = parseAnnouncements([
    ann('10 Nov 2026', 'Notice', 'Sell Declaration of a Director', 'intends to sell 100,000 shares'),
    ann('01 Mar 2026', 'Notice', 'Buy Declaration of a Director', 'intends to buy'),
    ann('01 Jan 2025', 'Notice', 'Sell Declaration of a Sponsor', 'intends to sell'),
  ]);
  const d = directorActivity(e, NOW);
  assert.deepStrictEqual([d.sells.length, d.buys.length], [1, 0]);
});

test('resolveRef follows a $id text chunk even right after other text', () => {
  const text = 'x"body":"$29"(end)29:T5,héllo rest';
  assert.strictEqual(resolveRef(text, '$29'), 'héll');
  assert.strictEqual(resolveRef(text, 'plain'), 'plain');
  assert.strictEqual(resolveRef(text, '$7f'), '');
});

test('a record date of today is no longer upcoming, because buying today is too late', () => {
  const e = parseAnnouncements([ann('29 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend for the year ended June 30, 2026. Record Date: 19.11.2026.')]);
  assert.strictEqual(dividendStatus(e, NOW).upcoming, null);
});

test('review: record and AGM dates in long-month or "on" wording are read', () => {
  const [d] = parseAnnouncements([ann('01 Nov 2026', 'Dividend', 'Dividend Declaration',
    'recommended 10% Cash Dividend. Record date on 20.11.2026. AGM will be held on 20 December 2026.')]).declarations;
  assert.deepStrictEqual([d.recordDate, d.agmDate], ['2026-11-20', '2026-12-20']);
  const [e] = parseAnnouncements([ann('01 Nov 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 20 November 2026.')]).declarations;
  assert.strictEqual(e.recordDate, '2026-11-20');
});

test('review: announcements without body or summary do not crash', () => {
  assert.doesNotThrow(() => parseAnnouncements([{ date: '01 Nov 2026', type: 'Dividend', summary: 'Dividend Declaration' }, { type: 'Notice' }]));
});

test('review: a buy notice by a director whose name contains "sell" stays a buy', () => {
  const e = parseAnnouncements([ann('10 Nov 2026', 'Notice', 'Buy Declaration of Mr. Russell', 'intends to buy')]);
  assert.deepStrictEqual(e.directorTrades.map((t) => t.side), ['buy']);
});

test('review: "stock dividend 5%" wording keeps the bonus shares', () => {
  const [d] = parseAnnouncements([ann('01 Nov 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% cash and stock dividend 5% for the year ended June 30, 2026.')]).declarations;
  assert.deepStrictEqual([d.cashPct, d.stockPct], [10, 5]);
});

test('review: a payout is credited to one declaration only, within 180 days of its record date', () => {
  const e = parseAnnouncements([
    ann('01 Dec 2026', 'Dividend', 'Dividend Disbursement', 'The Company has disbursed the cash dividend.'),
    ann('01 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 01.11.2026.'),
    ann('01 Oct 2024', 'Dividend', 'Dividend Declaration', 'recommended 8% Cash Dividend. Record Date: 01.11.2024.'),
  ]);
  assert.deepStrictEqual(e.declarations.map((d) => [d.recordDate, d.paidOn]), [['2026-11-01', '2026-12-01'], ['2024-11-01', null]]);
});

test('review: invalid dates are rejected and Dhaka time decides "today"', () => {
  assert.strictEqual(toIso('31.02.2026'), null);
  const e = parseAnnouncements([ann('29 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 20.11.2026.')]);
  assert.strictEqual(dividendStatus(e, new Date('2026-11-19T20:00:00Z')).upcoming, null);
  assert.strictEqual(dividendStatus(e, new Date('2026-11-19T10:00:00Z')).upcoming.recordDate, '2026-11-20');
});

test('review: next expected month is never in the past', () => {
  const e = parseAnnouncements([ann('03 Mar 2025', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 01.04.2025.')]);
  assert.strictEqual(dividendStatus(e, NOW).nextExpected, '2027-03');
});

test('last day to buy comes from DSE Spot News, else the previous trading day as an estimate', () => {
  const e = parseAnnouncements([
    ann('11 Nov 2026', 'Notice', 'Spot News', 'Trading will be allowed only in the Spot Market with cum benefit from 12.11.2026 to 15.11.2026 and trading will remain suspended on record date i.e., 16.11.2026.'),
    ann('27 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 130% Cash Dividend. Record Date: 16.11.2026.'),
    ann('29 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 22.11.2026.'),
  ]);
  const byRd = Object.fromEntries(e.declarations.map((d) => [d.recordDate, [d.lastBuyDate, d.lastBuyEstimated]]));
  assert.deepStrictEqual(byRd['2026-11-16'], ['2026-11-15', false]);
  assert.deepStrictEqual(byRd['2026-11-22'], ['2026-11-19', true]);
  assert.strictEqual(previousTradingDay('2026-11-22'), '2026-11-19');
});

test('review: two declarations never share one record-date notice', () => {
  const e = parseAnnouncements([
    ann('24 Nov 2024', 'Notice', 'Suspension for Record Date', 'record date i.e., 25.11.2024.'),
    ann('14 Nov 2024', 'Dividend', 'Dividend Declaration', 'recommended 50% Cash Dividend.'),
    ann('01 Nov 2024', 'Dividend', 'Dividend Declaration', 'recommended 40% Cash Dividend.'),
  ]);
  assert.deepStrictEqual(e.declarations.map((d) => d.recordDate).filter(Boolean), ['2024-11-25']);
});

test('review: a record date of today is reported as today, not as passed', () => {
  const e = parseAnnouncements([ann('29 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 19.11.2026.')]);
  const s = dividendStatus(e, NOW);
  assert.strictEqual(s.recordToday.recordDate, '2026-11-19');
  assert.strictEqual(s.upcoming, null);
});

test('review: Spot News dates written with month names are read', () => {
  const e = parseAnnouncements([
    ann('11 Nov 2026', 'Notice', 'Spot News', 'with cum benefit from 12 Nov 2026 to 15 Nov 2026 and trading will remain suspended on record date i.e., 16 Nov 2026.'),
    ann('27 Oct 2026', 'Dividend', 'Dividend Declaration', 'recommended 10% Cash Dividend. Record Date: 16.11.2026.'),
  ]);
  assert.deepStrictEqual([e.declarations[0].lastBuyDate, e.declarations[0].lastBuyEstimated], ['2026-11-15', false]);
});

test('browser review: the yearly EPS stated in a declaration is read', () => {
  const [d] = parseAnnouncements([ann('27 Oct 2026', 'Dividend', 'Dividend Declaration',
    'recommended 130% Cash Dividend for the year ended June 30, 2026. Record Date: 16.11.2026. The Company has also reported Consolidated EPS of Tk. 31.24, NAV of Tk. 178.99.')]).declarations;
  assert.strictEqual(d.eps, 31.24);
});
