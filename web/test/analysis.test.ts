import test from 'node:test';
import assert from 'node:assert';
import { analyze, sectorMedians, median, fiveYearSummary, pricePosition, metrics, fourQuestions, interimIsFresh, currentYield } from '../lib/analysis.ts';
import { cagr, trendSeries } from '../lib/financial-trends.ts';
import { real } from './real-companies.ts';
import { extractJson } from '../lib/extract.ts';
import type { Company, DividendStatus } from '../lib/types.ts';

const NOW = new Date('2026-11-19');

// Points 1.5 calendar days apart (about the DSE rate with weekends and holidays), ending on NOW: 260 points span ~13 months.
const pointDate = (back: number) => new Date(NOW.getTime() - Math.round(back * 1.5) * 86_400_000).toISOString().slice(0, 10);
function series(days: number, start: number, end: number, volume = 100_000): Array<{ date: string; price: number; volume: number }> {
  return Array.from({ length: days }, (_, i) => ({ date: pointDate(days - 1 - i), price: start + ((end - start) * i) / (days - 1), volume }));
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    version: 4,
    code: 'GOOD', name: 'Good Ltd', sector: 'Pharma', category: 'A',
    price: 100, eps: 10, nav: 60,
    changePct: null, marketCap: null, pe: null,
    dividendYield: 4, weekHigh52: 110, weekLow52: 90, paidUpCapital: 5e9,
    faceValue: 10, listingYear: null, yearEnd: null, agmDate: null,
    website: null, operationalStatus: null, loanStatus: null,
    interim: null, peLatest: null, asOf: null,
    years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 6 + i, pe: 14, nav: null, profit: null, dividend: null })),
    dividends: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, cash: 20, stock: 0, yieldPct: null })),
    sharePattern: [{ sponsor: 45 }, { sponsor: 45 }],
    series: series(120, 95, 100),
    ...overrides,
  };
}

test('a steady, cheap, profitable company is worth researching with no fraud flag', () => {
  const a = analyze(company(), 15, NOW);
  assert.strictEqual(a.signal, 'research');
  assert.strictEqual(a.fraud.level, 'clean');
  assert.ok(a.quality);
  assert.ok(a.history.some((h) => h.includes('cheaper than its own history')));
});

test('category Z is high fraud risk and avoid, with the score capped at 30', () => {
  const a = analyze(company({ category: 'Z' }), 15, NOW);
  assert.strictEqual(a.fraud.level, 'high');
  assert.strictEqual(a.signal, 'avoid');
  assert.ok(a.score <= 30);
});

test('a 40% monthly rise without earnings growth is flagged as a pump', () => {
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 5, pe: 14, nav: null, profit: null, dividend: null }));
  const pump = [...series(100, 70, 70), ...series(23, 70, 98)];
  const a = analyze(company({ years: flat, series: pump, price: 98 }), 15, NOW);
  assert.ok(a.fraud.flags.some((f) => f.title === 'Fast price rise'));
  assert.notStrictEqual(a.signal, 'research');
});

test('a volume five times the average is flagged only with a sharp price move', () => {
  const s = series(120, 100, 100);
  s[s.length - 1] = { ...s.at(-1)!, volume: 600_000 };
  const spike = (changePct: number) => analyze(company({ series: s, changePct }), 15, NOW).fraud.flags.some((f) => f.title === 'Volume spike');
  assert.strictEqual(spike(6), true);
  assert.strictEqual(spike(0.5), false);
});

test('sponsors selling, a profit jump and old results each raise a flag', () => {
  const years = [2020, 2021, 2022, 2023].map((year, i) => ({ year, eps: i === 3 ? 9 : 2, pe: 14, nav: null, profit: null, dividend: null }));
  const a = analyze(company({ years, sharePattern: [{ sponsor: 40 }, { sponsor: 35 }] }), 15, NOW);
  const titles = a.fraud.flags.map((f) => f.title);
  assert.deepStrictEqual(titles.sort(), ['Old financials', 'Sponsors selling', 'Sudden profit jump']);
  assert.strictEqual(a.fraud.level, 'suspicious');
});

test('a loss-making company is avoid', () => {
  const years = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: -1, pe: null, nav: null, profit: null, dividend: null }));
  assert.strictEqual(analyze(company({ years, eps: -1 }), 15, NOW).signal, 'avoid');
});

test('thin trading gives caution', () => {
  const a = analyze(company({ series: series(120, 100, 100, 50) }), 15, NOW);
  assert.strictEqual(a.signal, 'caution');
});

test('missing data never throws and gives no signal', () => {
  const a = analyze(company({ years: [], dividends: [], sharePattern: [], series: [], price: null }), null, NOW);
  assert.ok(['neutral', 'caution', 'avoid'].includes(a.signal));
});

test('sector median uses only profitable companies, and needs 3 of them', () => {
  const m = sectorMedians([company({ price: 100 }), company({ code: 'B', price: 50 }), company({ code: 'C', price: 120 }), company({ code: 'L', years: [{ year: 2025, eps: -2 }] })]);
  assert.strictEqual(m.Pharma, 10);
  const two = sectorMedians([company({ price: 100 }), company({ code: 'B', price: 50 }), company({ code: 'L', years: [{ year: 2025, eps: -2 }] })]);
  assert.strictEqual(two.Pharma, null);
  assert.ok(!analyze(company(), two.Pharma, NOW).reasons.some((r) => r.text.includes('sector median')));
  assert.deepStrictEqual(Object.keys(sectorMedians([company({ sector: '—' }), company({ code: 'B', sector: '' })])), []);
  assert.strictEqual(median([3, 1, 2]), 2);
});

test('extractJson reads nested objects and strings with brackets', () => {
  const text = 'x "company":{"name":"A {b} [c]","n":[1,{"k":2}]} y';
  assert.deepStrictEqual(extractJson(text, 'company'), { name: 'A {b} [c]', n: [1, { k: 2 }] });
  assert.strictEqual(extractJson(text, 'missing'), null);
});

test('old-financials flag waits for the reporting window early in the year', () => {
  const years = [2020, 2021, 2022, 2023, 2024].map((year, i) => ({ year, eps: 6 + i, pe: 14, nav: null, profit: null, dividend: null }));
  const flagged = (date: string) => analyze(company({ years }), 15, new Date(date)).fraud.flags.some((f) => f.title === 'Old financials');
  assert.strictEqual(flagged('2026-03-01'), false);
  assert.strictEqual(flagged('2026-11-19'), true);
});

test('dividend count covers exactly the last 5 years', () => {
  const dividends = [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ year, cash: 10, stock: 0, yieldPct: null }));
  const a = analyze(company({ dividends }), 15, NOW);
  assert.strictEqual(a.metrics.dividendYears, 5);
});

test('extractJson skips a string value and finds the object later', () => {
  assert.deepStrictEqual(extractJson('"company":"x" ... "company":{"code":"A"}', 'company'), { code: 'A' });
});

test('score always sits inside its signal band', () => {
  const bands: Record<string, [number, number]> = { avoid: [0, 30], caution: [31, 60], neutral: [61, 75], research: [76, 100] };
  const cases = [
    company(),
    company({ category: 'Z' }),
    company({ series: series(120, 100, 100, 50) }),
    company({ category: 'B' }),
    company({ years: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: -1, pe: null, nav: null, profit: null, dividend: null })) }),
  ];
  for (const c of cases) {
    const a = analyze(c, 15, NOW);
    const [lo, hi] = bands[a.signal];
    assert.ok(a.score >= lo && a.score <= hi, `${a.signal} score ${a.score}`);
  }
});

test('a cheaper, faster-growing research company scores higher', () => {
  const fast = company({ years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 5 * 1.25 ** i, pe: 14, nav: null, profit: null, dividend: null })) });
  const slow = company({ years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 9 + i * 0.25, pe: 14, nav: null, profit: null, dividend: null })) });
  assert.ok(analyze(fast, 15, NOW).score > analyze(slow, 15, NOW).score);
});

test('five-year summary derives ROE, dividend per share, payout and growth', () => {
  const c = company({
    faceValue: 10,
    years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 10 * 1.1 ** i, nav: 50 + i * 5, profit: 1000 * 1.1 ** i, pe: 12, dividend: null })),
    dividends: [{ year: 2025, cash: 60, stock: 5, yieldPct: 4.5 }, { year: 2024, cash: 50, stock: 0, yieldPct: 4 }],
  });
  const s = fiveYearSummary(c);
  const y25 = s.years.at(-1)!;
  assert.strictEqual(s.years.length, 5);
  assert.strictEqual(y25.dps, 6);
  assert.strictEqual(y25.roe, Math.round((14.641 / 70) * 1000) / 10);
  assert.strictEqual(y25.payout, Math.round((6 / 14.641) * 1000) / 10);
  assert.strictEqual(y25.stockPct, 5);
  assert.strictEqual(s.growth.eps, 10);
  assert.strictEqual(s.growth.profit, 10);
  assert.strictEqual(s.years[0].dps, null);
});

test('five-year summary survives losses, missing NAV and no dividends', () => {
  const c = company({ years: [{ year: 2024, eps: -2, nav: 0, profit: -50, pe: null, dividend: null }, { year: 2025, eps: 1, nav: null, profit: 20, pe: 30, dividend: null }], dividends: [] });
  const s = fiveYearSummary(c);
  assert.deepStrictEqual(s.years.map((y) => [y.roe, y.payout, y.pb]), [[null, null, null], [null, null, null]]);
  assert.strictEqual(s.growth.eps, null);
  assert.strictEqual(s.growth.profit, null);
});

function positioned(peNow: number, epsTrend: 'up' | 'down') {
  const eps = epsTrend === 'up' ? [5, 6, 7, 8, 9, 10] : [10, 9, 8, 7, 6, 5];
  const pes = [10, 14, 18, 12, 16, 15];
  const c = company({ years: [2020, 2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: eps[i], pe: pes[i], nav: null, profit: null, dividend: null })), series: [], price: peNow * eps[5] });
  return pricePosition(c, metrics(c, NOW));
}

test('price position gives the four value verdicts from P/E zone and earnings trend', () => {
  assert.strictEqual(positioned(10, 'up').verdict!.key, 'value');
  assert.strictEqual(positioned(10, 'down').verdict!.key, 'trap');
  assert.strictEqual(positioned(18, 'up').verdict!.key, 'expensive');
  assert.strictEqual(positioned(18, 'down').verdict!.key, 'risky');
  assert.strictEqual(positioned(14, 'up').verdict!.key, 'fair');
});

test('price position bands and one-year-later history are computed from year-end prices', () => {
  const p = positioned(10, 'up');
  assert.deepStrictEqual([p.pe!.low, p.pe!.high, p.pe!.now], [10, 18, 10]);
  assert.ok(p.history.every((h) => h.year >= 2021), 'table covers the same 5 years as the bands');
  assert.strictEqual(p.pe!.position, 0);
  assert.strictEqual(p.history.length, 4);
  assert.deepStrictEqual(p.history[0], { year: 2021, pe: 14, price: 84, nextPrice: 126, change: 50 });
  assert.strictEqual(p.price!.avg, (14 * 6 + 18 * 7 + 12 * 8 + 16 * 9 + 15 * 10) / 5);
  assert.ok(p.cheapYearsUp <= p.cheapYears);
});

test('price position returns nulls instead of throwing without P/E history', () => {
  const c = company({ years: [{ year: 2025, eps: -1, pe: null, nav: null, profit: null, dividend: null }], series: [] });
  const p = pricePosition(c, metrics(c, NOW));
  assert.strictEqual(p.verdict, null);
  assert.strictEqual(p.pe, null);
  assert.deepStrictEqual(p.history, []);
});

test('review ORIONINFU: a stretched P/E or P/B can never be worth researching', () => {
  const a = analyze(company({ price: 1180 }), 24, NOW);
  assert.notStrictEqual(a.signal, 'research');
  assert.strictEqual(a.checks.find((x) => x.label === 'Price not stretched')!.ok, false);
});

test('review ISLAMIBANK: a loss in the latest quarter fails the profit check', () => {
  const c = company({ interim: { periods: { nine: '202609' }, eps: { metric: 'EPS', q1: -5, half: -12, nine: -20.41 } } });
  const a = analyze(c, 15, NOW);
  assert.strictEqual(a.checks.find((x) => x.label.startsWith('Profit every year'))!.ok, false);
  assert.notStrictEqual(a.signal, 'research');
  assert.ok(a.reasons.some((r) => r.text.includes('9-month') && r.tone === 'bad'));
});

test('review APEXSPINN: a slow 1-year pump with flat earnings is flagged', () => {
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 3.6, pe: 14, nav: null, profit: null, dividend: null }));
  const a = analyze(company({ years: flat, series: series(260, 140, 409), price: 409 }), 15, NOW);
  assert.ok(a.fraud.flags.some((f) => f.title === 'Fast price rise' && f.detail.includes('1 year')));
});

test('review PRIMEBANK: sponsor drop plus a quiet volume spike is suspicious, not high risk', () => {
  const s = series(120, 100, 100);
  s[s.length - 1] = { ...s.at(-1)!, volume: 600_000 };
  const a = analyze(company({ series: s, changePct: 6, sharePattern: [{ sponsor: 40 }, { sponsor: 37.2 }] }), 15, NOW);
  assert.strictEqual(a.fraud.level, 'suspicious');
});

test('review RENATA: shrinking earnings give caution and "good business" is not a yes', () => {
  const shrinking = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 40 * 0.78 ** i, pe: 30, nav: null, profit: null, dividend: null }));
  const c = company({ years: shrinking, price: 200 });
  const a = analyze(c, 40, NOW);
  assert.strictEqual(a.signal, 'caution');
  const q = fourQuestions(c, a, null, null);
  assert.notStrictEqual(q[0].answer, 'yes');
});

test('review BXPHARMA: a recent dividend declaration for the new year cancels "old financials"', () => {
  const years = [2020, 2021, 2022, 2023, 2024].map((year, i) => ({ year, eps: 6 + i, pe: 14, nav: null, profit: null, dividend: null }));
  const events = { declarations: [{ announced: '2026-10-29', cashPct: 60, interim: false, periodEnd: '2026-06-30' }], directorTrades: [] };
  const a = analyze(company({ years, events }), 15, NOW);
  assert.ok(!a.fraud.flags.some((f) => f.title === 'Old financials'));
});

test('review: yield comes from the latest declaration and the face value', () => {
  const events = { declarations: [{ announced: '2026-10-27', cashPct: 130, interim: false }], directorTrades: [] };
  const a = analyze(company({ events, price: 210.3, faceValue: 10, dividendYield: 5.74 }), 15, NOW);
  assert.strictEqual(a.metrics.latestYield, 6.18);
});

test('review: an interim result older than 15 months is ignored', () => {
  const c = company({ interim: { periods: { half: '202412' }, eps: { metric: 'EPS', half: -3 } } });
  const a = analyze(c, 15, NOW);
  assert.strictEqual(a.metrics.interim, null);
  assert.strictEqual(a.checks.find((x) => x.label.startsWith('Profit every year'))!.ok, true);
});

test('review: a "no dividend" declaration sets the yield to 0', () => {
  const events = { declarations: [{ announced: '2026-10-01', noDividend: true, interim: false }, { announced: '2025-12-01', cashPct: 10, interim: false }], directorTrades: [] };
  assert.strictEqual(analyze(company({ events }), 15, NOW).metrics.latestYield, 0);
});

test('review: one price move cannot make "high risk" on its own', () => {
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 2, pe: 14, nav: null, profit: null, dividend: null }));
  const pumped = [...series(100, 20, 20), ...series(64, 20, 31)];
  const a = analyze(company({ years: flat, series: pumped, price: 31, paidUpCapital: 2e8 }), 15, NOW);
  const titles = a.fraud.flags.map((f) => f.title);
  assert.ok(titles.includes('Fast price rise') && titles.includes('Small company, fast rise'));
  assert.strictEqual(a.fraud.level, 'suspicious');
});

test('browser review: growth starts from a normal year, not a tiny base', () => {
  const years = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: [0.56, 3.2, 3.4, 3.58, 8.4][i], pe: 12, nav: null, profit: null, dividend: null }));
  const a = analyze(company({ years }), 15, NOW);
  assert.strictEqual(a.metrics.growthFrom, 2022);
  assert.ok((a.metrics.epsCagr ?? 0) < 40, `cagr ${a.metrics.epsCagr}`);
});

test('browser review: a newer yearly EPS from a declaration is used before DSE updates its table', () => {
  const events = { declarations: [{ announced: '2026-10-27', cashPct: 130, interim: false, periodEnd: '2026-06-30', eps: 31.24 }], directorTrades: [] };
  const a = analyze(company({ events, price: 210.3 }), 15, NOW);
  assert.strictEqual(a.metrics.epsNow, 31.24);
  assert.strictEqual(a.metrics.pe, Math.round((210.3 / 31.24) * 100) / 100);
  assert.ok(a.history.some((h) => h.includes('2026 result')));
});

test('browser review: answer texts show readable dates, and shrinking earnings appear once', () => {
  const shrinking = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 40 * 0.9 ** i, pe: 20, nav: null, profit: null, dividend: null }));
  const c = company({ years: shrinking });
  const a = analyze(c, 30, NOW);
  assert.strictEqual(a.history.filter((h) => h.includes('shrank')).length + a.reasons.filter((r) => r.text.includes('shrank')).length, 1);
  const q = fourQuestions(c, a, null, { latest: { cashPct: 10, recordDate: '2026-11-16' }, nextExpected: '2027-10' } as unknown as DividendStatus);
  assert.ok(q[3].text.includes('16 Nov 2026'), q[3].text);
});

test('interimIsFresh drops interim figures older than 15 months', () => {
  const now = new Date(2026, 10, 19);
  const at = (p: string) => ({ periods: { q1: p }, eps: { q1: 5 } }) as never;
  assert.equal(interimIsFresh(at('202609'), now), true);
  assert.equal(interimIsFresh(at('202508'), now), true);
  assert.equal(interimIsFresh(at('202507'), now), false);
  assert.equal(interimIsFresh(undefined, now), false);
  assert.equal(interimIsFresh({ periods: {}, eps: { q1: 5 } } as never, now), false);
});

test('M3: the 12-month cash of an interim + final payer (GP) sums both payments', () => {
  assert.strictEqual(currentYield(real('GP'), 226.9, new Date('2026-11-20')).cash, 21);
});

test('L9: the five-year table and the Financials cards give the same ROE, payout, P/B and CAGR', () => {
  const c = company({
    years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 3 + i * 0.7, nav: 20 + i * 3, profit: 100 + i * 9, pe: 11 + i, dividend: null })),
    dividends: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, cash: 15 + i * 5, stock: 0, yieldPct: null })),
  });
  const s = fiveYearSummary(c);
  const t = trendSeries(c.years, c.dividends, 10);
  const r = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  assert.deepStrictEqual(s.years.map((y) => y.roe), t.roe.map((p) => r(p.value)));
  assert.deepStrictEqual(s.years.map((y) => y.payout), t.payout.map((p) => r(p.value)));
  assert.deepStrictEqual(s.years.map((y) => y.pb), t.pb.map((p) => r(p.value, 2)));
  assert.strictEqual(s.growth.eps, r(cagr(t.eps)!.pct));
});

test('L10: the interim period is the period of the EPS shown, not the newest period on the page', () => {
  const c = company({ interim: { periods: { nine: '202609', half: '202606' }, eps: { metric: 'EPS', half: 5 } } });
  assert.deepStrictEqual(metrics(c, NOW).interim, { value: 5, label: '6-month', period: '202606' });
});

test('L11: a price series shorter than a year gives no 1-year change and so no 1-year pump', () => {
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 3.6, pe: 14, nav: null, profit: null, dividend: null }));
  const young = company({ years: flat, series: series(150, 140, 409), price: 409 });
  assert.strictEqual(metrics(young, NOW).change1y, null);
  assert.ok(!analyze(young, 15, NOW).fraud.flags.some((f) => f.detail.includes('1 year')));
  assert.notStrictEqual(metrics(company({ years: flat, series: series(260, 140, 409), price: 409 }), NOW).change1y, null);
});

// --- fresh-eyes fixes (2026-11-21) ---
import { declaredText, dividendRecord, hasSector } from '../lib/analysis.ts';
import { dividendStatus, paymentState } from '../lib/announcements.ts';
import { TREND_KIND, bonusFactor, trendChange } from '../lib/financial-trends.ts';

test('1-year change is last close vs the last close on or before 365 days back, not the oldest stored row', () => {
  // 260 points 1.5 days apart: the oldest row is ~388 days back; the 1-year base is the row 244 points back.
  const s = series(260, 100, 200);
  const base = s.find((p) => p.date <= new Date(NOW.getTime() - 365 * 86_400_000).toISOString().slice(0, 10) && s[s.indexOf(p) + 1].date > new Date(NOW.getTime() - 365 * 86_400_000).toISOString().slice(0, 10))!;
  const m = metrics(company({ series: s, price: 200 }), NOW);
  assert.strictEqual(m.change1y, Math.round(((200 - base.price) / base.price) * 1000) / 10);
  assert.notStrictEqual(m.change1y, 100, 'closes[0] would give +100%');
});

test('one headline P/E with its EPS basis; DSE P/Es kept with labels (SQURPHARMA)', () => {
  const c = company({ price: 209.7, yearEnd: 'June', peLatest: { audited: 7.76, unaudited: 5.98 },
    events: { declarations: [{ announced: '2026-10-27', cashPct: 130, eps: 31.24, periodEnd: '2026-06-30', recordDate: '2026-11-16', agmDate: '2026-12-15' }] } });
  const m = metrics(c, NOW);
  assert.strictEqual(round2(m.pe!), 6.71);
  assert.strictEqual(m.peBasis, 'FY Jun-2026 audited (announced)');
  assert.strictEqual(m.peEpsYear, 2026);
  assert.deepStrictEqual(m.peOthers.map((x) => x.value), [7.76, 5.98]);
  assert.strictEqual(metrics(company({ yearEnd: 'December' }), NOW).peBasis, 'FY Dec-2025 audited');
  assert.strictEqual(metrics(company({ years: [{ year: 2025, eps: -1, pe: null }] }), NOW).peBasis, null);
});
const round2 = (n: number) => Math.round(n * 100) / 100;

test('EPS growth uses bonus-adjusted EPS (BATBC 2018 ৳166.87 before two 200% bonus issues)', () => {
  const years = [[2018, 166.87], [2019, 51.37], [2020, 60.48], [2021, 27.72], [2022, 33.1]].map(([year, eps]) => ({ year, eps, pe: 15, nav: null, profit: null, dividend: null }));
  const dividends = [{ year: 2018, cash: 500, stock: 200 }, { year: 2019, cash: 400, stock: 0 }, { year: 2020, cash: 600, stock: 200 }, { year: 2021, cash: 275, stock: 0 }, { year: 2022, cash: 200, stock: 0 }];
  const f = bonusFactor(dividends, 2022);
  assert.deepStrictEqual([f(2018), f(2019), f(2020), f(2021)], [9, 3, 3, 1]);
  const m = metrics(company({ years, dividends }), NOW);
  // 166.87 / 9 = 18.54 → 33.10 over 4 years: +15.6% a year, not −33%.
  assert.strictEqual(m.epsCagr, 15.6);
  assert.deepStrictEqual([m.growthFrom, m.growthYears], [2018, 4]);
  const t = trendSeries(years, dividends, 10);
  assert.strictEqual(round2(t.eps[0].value), 18.54);
  assert.strictEqual(Math.round(trendChange(t.eps)!.value * 10) / 10, m.epsCagr, 'the Financials card and the metric agree');
  assert.ok(analyze(company({ years, dividends }), 15, NOW).history.some((h) => h.includes('15.6% a year over 4 years (since 2018)')));
});

test('ratios report a plain change, not a CAGR; the kind is exported per card', () => {
  assert.deepStrictEqual(TREND_KIND, { profit: 'cagr', eps: 'cagr', nav: 'cagr', roe: 'pp', payout: 'pp', pe: 'diff', pb: 'diff' });
  const roe = [2021, 2022, 2023, 2024, 2025, 2026].map((year, i) => ({ year, value: 10 + i }));
  assert.deepStrictEqual(trendChange(roe, 'pp'), { kind: 'pp', value: 4, years: 4, from: 2022, to: 2026 });
  assert.strictEqual(trendChange([{ year: 2025, value: 3 }], 'pp'), null);
});

test('usual P/E: median of the last 5, skipping P/E over 100 and EPS under 5% of the latest (ROBI)', () => {
  const years = [[2021, 0.34, 100.5], [2022, 0.35, 86], [2023, 0.61, 48.96], [2024, 1.34, 21.09], [2025, 1.79, 15.76]].map(([year, eps, pe]) => ({ year, eps, pe, nav: null, profit: null, dividend: null }));
  assert.strictEqual(metrics(company({ years, price: 29.6 }), NOW).avgPastPe, 35);
  const tiny = [[2021, 0.05, 60], [2022, 2, 10], [2023, 2, 12], [2024, 2, 14], [2025, 2, 11]].map(([year, eps, pe]) => ({ year, eps, pe, nav: null, profit: null, dividend: null }));
  assert.strictEqual(metrics(company({ years: tiny, price: 22 }), NOW).avgPastPe, 11.5, '0.05 < 5% of 2: skipped');
});

test('usual P/E is the same in metrics and the price position when a loss year sits in the last 5', () => {
  const pe: Record<number, number | null> = { 2019: 7, 2020: 8, 2021: 9, 2022: 10, 2023: null, 2024: 11, 2025: 12 };
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: year === 2023 ? -1 : 5, pe: pe[year], nav: null, profit: null, dividend: null }));
  const c = company({ years, price: 50 });
  const m = metrics(c, NOW);
  assert.deepStrictEqual([m.avgPastPe, pricePosition(c, m).usualPe], [10.5, 10.5], '2021, 2022, 2024, 2025: 2020 is older than newest − 5');
});

test('cheap on its own P/E but dear on book value gives one verdict naming both (GP)', () => {
  const years = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 26 - i, pe: 14, nav: null, profit: null, dividend: null }));
  const c = company({ years, price: 220, nav: 40 });
  const a = analyze(c, 15, NOW);
  const q = fourQuestions(c, a, pricePosition(c, metrics(c, NOW)), null)[1];
  assert.ok(/P\/E .* against its usual .*but P\/B 5\.5 is above 5/.test(q.text), q.text);
  assert.ok(a.history.some((h) => h.includes('cheaper than its own history, but at 5.5× book value')), a.history.join(' | '));
});

test('a share with no trades in 52 weeks gets no range verdict and no price band (SAVAREFR)', () => {
  const s = series(260, 215.5, 215.5).map((p) => ({ ...p, volume: 0, trades: 0 }));
  const years = [2021, 2022, 2023].map((year) => ({ year, eps: -4, pe: null, nav: null, profit: null, dividend: null }));
  const c = company({ series: s, price: 215.5, years });
  const m = metrics(c, NOW);
  assert.deepStrictEqual([m.illiquid, m.lastTradeDate, m.change1y], [true, null, null]);
  const a = analyze(c, 15, NOW);
  assert.ok(!a.history.some((h) => h.includes('52-week range') || h.includes('52-week low') || h.includes('52-week high')));
  assert.strictEqual(fourQuestions(c, a, pricePosition(c, m), null)[1].label, 'No trades in 52 weeks');
  const two = company({ years: [2024, 2025].map((year) => ({ year, eps: 5, pe: 12, nav: null, profit: null, dividend: null })) });
  assert.strictEqual(pricePosition(two, metrics(two, NOW)).price, null, 'two year-end prices are not a range');
  assert.notStrictEqual(pricePosition(company(), metrics(company(), NOW)).price, null);
});

test('12-month yield counts one final per fiscal year: a late-paid older final is left out with a note (BXPHARMA)', () => {
  const declarations = [
    { announced: '2026-10-29', cashPct: 60, recordDate: '2026-11-19', periodEnd: '2026-06-30' },
    { announced: '2026-06-24', cashPct: 47.5, recordDate: '2026-08-02', periodEnd: '2025-06-30' },
    { announced: '2024-10-29', cashPct: 40, recordDate: '2024-11-25', periodEnd: '2024-06-30' },
  ];
  const y = currentYield(company({ events: { declarations } }), 149.4, new Date('2026-11-21'));
  assert.deepStrictEqual([y.cash, y.value], [6, 4.02], 'not 10.75 / 7.2%');
  assert.strictEqual(y.note, 'Left out ৳4.8 FY2025 final: an older or repeated final paid in the same 12 months');
  assert.strictEqual(metrics(company({ events: { declarations }, price: 149.4 }), new Date('2026-11-21')).yieldNote, y.note);
  // An interim of the newer fiscal year still counts beside its final.
  const withInterim = [{ announced: '2026-03-01', cashPct: 20, interim: true, recordDate: '2026-03-20', periodEnd: '2026-06-30' }, ...declarations];
  assert.strictEqual(currentYield(company({ events: { declarations: withInterim } }), 149.4, new Date('2026-11-21')).cash, 8);
  const one = currentYield(company({ events: { declarations: [declarations[0]] } }), 149.4, new Date('2026-11-21'));
  assert.deepStrictEqual([one.cash, one.note], [6, null]);
  const bonusNewest = [{ announced: '2026-10-29', cashPct: 0, stockPct: 10, recordDate: '2026-11-19', periodEnd: '2026-06-30' }, declarations[1]];
  assert.strictEqual(currentYield(company({ events: { declarations: bonusNewest } }), 149.4, new Date('2026-11-21')).cash, 4.75, 'a bonus-only newest final does not drop the cash paid');
});

test('payment state: "no payment notice" after AGM + 45 days; a declared, unpaid dividend is reported (BATBC, SQURPHARMA)', () => {
  const batbc = { announced: '2026-03-03', cashPct: 30, recordDate: '2026-04-01', agmDate: '2026-04-30', paidOn: null };
  assert.strictEqual(paymentState(batbc, '2026-11-21'), 'no-notice');
  assert.strictEqual(paymentState(batbc, '2026-05-20'), 'pending');
  assert.strictEqual(paymentState({ ...batbc, paidOn: '2026-05-25' }, '2026-11-21'), 'paid');
  assert.strictEqual(paymentState({ announced: '2023-10-29', noDividend: true, recordDate: '2023-11-21' }, '2026-11-21'), 'none');
  assert.strictEqual(paymentState({ announced: '2026-03-03', stockPct: 10, recordDate: '2026-04-01' }, '2026-11-21'), 'none', 'bonus shares only: no cash to pay');
  assert.strictEqual(paymentState({ announced: '2026-03-03', cashPct: 0, stockPct: 10, recordDate: '2026-04-01' }, '2026-05-01'), 'none');
  const sq = { announced: '2026-10-27', cashPct: 130, recordDate: '2026-11-16', agmDate: '2026-12-15', paidOn: null, periodEnd: '2026-06-30' };
  const st = dividendStatus({ declarations: [sq] }, new Date('2026-11-21T06:00:00Z'));
  assert.strictEqual(st.unpaid?.cashPct, 130);
  assert.strictEqual(declaredText(st.unpaid!, 10), '৳13 a share declared, payment after the 15 Dec 2026 AGM.');
  const c = company({ events: { declarations: [sq] } });
  const q = fourQuestions(c, analyze(c, 15, NOW), null, st)[3];
  assert.ok(q.text.startsWith('৳13 a share declared, payment after the 15 Dec 2026 AGM.'), q.text);
});

test('one dividend table: newest declared years added, announced total checked against DSE (SQURPHARMA, BATBC)', () => {
  const c = company({
    dividends: [{ year: 2025, cash: 120, stock: 0, yieldPct: 5.74 }, { year: 2024, cash: 300, stock: 12.5, yieldPct: 8.16, rights: '1R:2' }],
    events: { declarations: [
      { announced: '2026-10-27', cashPct: 130, eps: 31.24, periodEnd: '2026-06-30', recordDate: '2026-11-16' },
      { announced: '2025-02-06', cashPct: 150, periodEnd: '2024-12-31', recordDate: '2025-02-26' },
    ] },
  });
  const rows = dividendRecord(c, NOW);
  assert.deepStrictEqual(rows.map((r) => [r.year, r.cashPct, r.declared]), [[2026, 130, true], [2025, 120, false], [2024, 300, false]]);
  assert.strictEqual(rows[0].cashPerShare, 13);
  assert.strictEqual(rows[2].stockPct, 12.5, 'bonus keeps its decimals');
  assert.strictEqual(rows[2].rights, '1R:2');
  assert.ok(rows[2].note?.includes('150%') && rows[2].note.includes('300%'));
  assert.strictEqual(rows[1].note, null);
});

test('an empty or "—" sector is not a sector', () => {
  assert.deepStrictEqual(['', '—', ' ', null, 'Bank'].map(hasSector), [false, false, false, false, true]);
});
