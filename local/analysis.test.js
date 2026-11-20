const test = require('node:test');
const assert = require('node:assert');
const { analyze, sectorMedians, median, fiveYearSummary, pricePosition, metrics } = require('./lib/analysis');
const { extractJson } = require('./lib/extract');

const NOW = new Date('2026-11-19');

function series(days, start, end, volume = 100_000) {
  return Array.from({ length: days }, (_, i) => ({ date: `d${i}`, price: start + ((end - start) * i) / (days - 1), volume }));
}

function company(overrides = {}) {
  return {
    code: 'GOOD', name: 'Good Ltd', sector: 'Pharma', category: 'A', price: 100, eps: 10, nav: 60,
    dividendYield: 4, weekHigh52: 110, weekLow52: 90, paidUpCapital: 5e9,
    years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 6 + i, pe: 14 })),
    dividends: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, cash: 20, stock: 0 })),
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
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 5, pe: 14 }));
  const pump = [...series(100, 70, 70), ...series(23, 70, 98)];
  const a = analyze(company({ years: flat, series: pump, price: 98 }), 15, NOW);
  assert.ok(a.fraud.flags.some((f) => f.title === 'Price pump'));
  assert.notStrictEqual(a.signal, 'research');
});

test('a volume five times the average is flagged only with a sharp price move', () => {
  const s = series(120, 100, 100);
  s[s.length - 1] = { ...s.at(-1), volume: 600_000 };
  const spike = (changePct) => analyze(company({ series: s, changePct }), 15, NOW).fraud.flags.some((f) => f.title === 'Volume spike');
  assert.strictEqual(spike(6), true);
  assert.strictEqual(spike(0.5), false);
});

test('sponsors selling, a profit jump and old results each raise a flag', () => {
  const years = [2020, 2021, 2022, 2023].map((year, i) => ({ year, eps: i === 3 ? 9 : 2, pe: 14 }));
  const a = analyze(company({ years, sharePattern: [{ sponsor: 40 }, { sponsor: 35 }] }), 15, NOW);
  const titles = a.fraud.flags.map((f) => f.title);
  assert.deepStrictEqual(titles.sort(), ['Old financials', 'Sponsors selling', 'Sudden profit jump']);
  assert.strictEqual(a.fraud.level, 'suspicious');
});

test('a loss-making company is avoid', () => {
  const years = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: -1 }));
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

test('sector median uses only profitable companies', () => {
  const m = sectorMedians([company({ price: 100 }), company({ code: 'B', price: 50 }), company({ code: 'L', years: [{ year: 2025, eps: -2 }] })]);
  assert.strictEqual(m.Pharma, 7.5);
  assert.strictEqual(median([3, 1, 2]), 2);
});

test('extractJson reads nested objects and strings with brackets', () => {
  const text = 'x "company":{"name":"A {b} [c]","n":[1,{"k":2}]} y';
  assert.deepStrictEqual(extractJson(text, 'company'), { name: 'A {b} [c]', n: [1, { k: 2 }] });
  assert.strictEqual(extractJson(text, 'missing'), null);
});

test('old-financials flag waits for the reporting window early in the year', () => {
  const years = [2020, 2021, 2022, 2023, 2024].map((year, i) => ({ year, eps: 6 + i, pe: 14 }));
  const flagged = (date) => analyze(company({ years }), 15, new Date(date)).fraud.flags.some((f) => f.title === 'Old financials');
  assert.strictEqual(flagged('2026-03-01'), false);
  assert.strictEqual(flagged('2026-11-19'), true);
});

test('dividend count covers exactly the last 5 years', () => {
  const dividends = [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ year, cash: 10, stock: 0 }));
  const a = analyze(company({ dividends }), 15, NOW);
  assert.strictEqual(a.metrics.dividendYears, 5);
});

test('extractJson skips a string value and finds the object later', () => {
  assert.deepStrictEqual(extractJson('"company":"x" ... "company":{"code":"A"}', 'company'), { code: 'A' });
});

test('score always sits inside its signal band', () => {
  const bands = { avoid: [0, 30], caution: [31, 60], neutral: [61, 75], research: [76, 100] };
  const cases = [company(), company({ category: 'Z' }), company({ series: series(120, 100, 100, 50) }),
    company({ category: 'B' }), company({ years: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: -1 })) })];
  for (const c of cases) {
    const a = analyze(c, 15, NOW);
    const [lo, hi] = bands[a.signal];
    assert.ok(a.score >= lo && a.score <= hi, `${a.signal} score ${a.score}`);
  }
});

test('a cheaper, faster-growing research company scores higher', () => {
  const fast = company({ years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 5 * 1.25 ** i, pe: 14 })) });
  const slow = company({ years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 9 + i * 0.25, pe: 14 })) });
  assert.ok(analyze(fast, 15, NOW).score > analyze(slow, 15, NOW).score);
});

test('five-year summary derives ROE, dividend per share, payout and growth', () => {
  const c = company({
    faceValue: 10,
    years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 10 * 1.1 ** i, nav: 50 + i * 5, profit: 1000 * 1.1 ** i, pe: 12 })),
    dividends: [{ year: 2025, cash: 60, stock: 5, yieldPct: 4.5 }, { year: 2024, cash: 50, stock: 0, yieldPct: 4 }],
  });
  const s = fiveYearSummary(c);
  const y25 = s.years.at(-1);
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
  const c = company({ years: [{ year: 2024, eps: -2, nav: 0, profit: -50, pe: null }, { year: 2025, eps: 1, nav: null, profit: 20, pe: 30 }], dividends: [] });
  const s = fiveYearSummary(c);
  assert.deepStrictEqual(s.years.map((y) => [y.roe, y.payout, y.pb]), [[null, null, null], [null, null, null]]);
  assert.strictEqual(s.growth.eps, null);
  assert.strictEqual(s.growth.profit, null);
});

function positioned(peNow, epsTrend) {
  const eps = epsTrend === 'up' ? [5, 6, 7, 8, 9, 10] : [10, 9, 8, 7, 6, 5];
  const pes = [10, 14, 18, 12, 16, 15];
  const c = company({ years: [2020, 2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: eps[i], pe: pes[i] })), series: [], price: peNow * eps[5] });
  return pricePosition(c, metrics(c, NOW));
}

test('price position gives the four value verdicts from P/E zone and earnings trend', () => {
  assert.strictEqual(positioned(10, 'up').verdict.key, 'value');
  assert.strictEqual(positioned(10, 'down').verdict.key, 'trap');
  assert.strictEqual(positioned(18, 'up').verdict.key, 'expensive');
  assert.strictEqual(positioned(18, 'down').verdict.key, 'risky');
  assert.strictEqual(positioned(14, 'up').verdict.key, 'fair');
});

test('price position bands and one-year-later history are computed from year-end prices', () => {
  const p = positioned(10, 'up');
  assert.deepStrictEqual([p.pe.low, p.pe.high, p.pe.now], [10, 18, 10]);
  assert.ok(p.history.every((h) => h.year >= 2021), 'table covers the same 5 years as the bands');
  assert.strictEqual(p.pe.position, 0);
  assert.strictEqual(p.history.length, 4);
  assert.deepStrictEqual(p.history[0], { year: 2021, pe: 14, price: 84, nextPrice: 126, change: 50 });
  assert.strictEqual(p.price.avg, (14 * 6 + 18 * 7 + 12 * 8 + 16 * 9 + 15 * 10) / 5);
  assert.ok(p.cheapYearsUp <= p.cheapYears);
});

test('price position returns nulls instead of throwing without P/E history', () => {
  const c = company({ years: [{ year: 2025, eps: -1, pe: null }], series: [] });
  const p = pricePosition(c, metrics(c, NOW));
  assert.strictEqual(p.verdict, null);
  assert.strictEqual(p.pe, null);
  assert.deepStrictEqual(p.history, []);
});

test('review ORIONINFU: a stretched P/E or P/B can never be worth researching', () => {
  const a = analyze(company({ price: 1180 }), 24, NOW);
  assert.notStrictEqual(a.signal, 'research');
  assert.strictEqual(a.checks.find((x) => x.label === 'Price not stretched').ok, false);
});

test('review ISLAMIBANK: a loss in the latest quarter fails the profit check', () => {
  const c = company({ interim: { periods: {}, eps: { metric: 'EPS', q1: -5, half: -12, nine: -20.41 } } });
  const a = analyze(c, 15, NOW);
  assert.strictEqual(a.checks.find((x) => x.label.startsWith('Profit every year')).ok, false);
  assert.notStrictEqual(a.signal, 'research');
  assert.ok(a.reasons.some((r) => r.text.includes('9-month') && r.tone === 'bad'));
});

test('review APEXSPINN: a slow 1-year pump with flat earnings is flagged', () => {
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 3.6, pe: 14 }));
  const a = analyze(company({ years: flat, series: series(260, 140, 409), price: 409 }), 15, NOW);
  assert.ok(a.fraud.flags.some((f) => f.title === 'Price pump' && f.detail.includes('1 year')));
});

test('review PRIMEBANK: sponsor drop plus a quiet volume spike is suspicious, not high risk', () => {
  const s = series(120, 100, 100);
  s[s.length - 1] = { ...s.at(-1), volume: 600_000 };
  const a = analyze(company({ series: s, changePct: 6, sharePattern: [{ sponsor: 40 }, { sponsor: 37.2 }] }), 15, NOW);
  assert.strictEqual(a.fraud.level, 'suspicious');
});

test('review RENATA: shrinking earnings give caution and "good business" is not a yes', () => {
  const shrinking = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 40 * 0.78 ** i, pe: 30 }));
  const c = company({ years: shrinking, price: 200 });
  const a = analyze(c, 40, NOW);
  assert.strictEqual(a.signal, 'caution');
  const q = require('./lib/analysis').fourQuestions(c, a, null, null);
  assert.notStrictEqual(q[0].answer, 'yes');
});

test('review BXPHARMA: a recent dividend declaration for the new year cancels "old financials"', () => {
  const years = [2020, 2021, 2022, 2023, 2024].map((year, i) => ({ year, eps: 6 + i, pe: 14 }));
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
  assert.strictEqual(a.checks.find((x) => x.label.startsWith('Profit every year')).ok, true);
});

test('review: a "no dividend" declaration sets the yield to 0', () => {
  const events = { declarations: [{ announced: '2026-10-01', noDividend: true, interim: false }, { announced: '2025-12-01', cashPct: 10, interim: false }], directorTrades: [] };
  assert.strictEqual(analyze(company({ events }), 15, NOW).metrics.latestYield, 0);
});

test('review: one price move cannot make "high risk" on its own', () => {
  const flat = [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, eps: 2, pe: 14 }));
  const pumped = [...series(100, 20, 20), ...series(64, 20, 31)];
  const a = analyze(company({ years: flat, series: pumped, price: 31, paidUpCapital: 2e8 }), 15, NOW);
  const titles = a.fraud.flags.map((f) => f.title);
  assert.ok(titles.includes('Price pump') && titles.includes('Small company, fast rise'));
  assert.strictEqual(a.fraud.level, 'suspicious');
});

test('browser review: growth starts from a normal year, not a tiny base', () => {
  const years = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: [0.56, 3.2, 3.4, 3.58, 8.4][i], pe: 12 }));
  const a = analyze(company({ years }), 15, NOW);
  assert.strictEqual(a.metrics.growthFrom, 2022);
  assert.ok(a.metrics.epsCagr < 40, `cagr ${a.metrics.epsCagr}`);
});

test('browser review: a newer yearly EPS from a declaration is used before DSE updates its table', () => {
  const events = { declarations: [{ announced: '2026-10-27', cashPct: 130, interim: false, periodEnd: '2026-06-30', eps: 31.24 }], directorTrades: [] };
  const a = analyze(company({ events, price: 210.3 }), 15, NOW);
  assert.strictEqual(a.metrics.epsNow, 31.24);
  assert.strictEqual(a.metrics.pe, Math.round((210.3 / 31.24) * 100) / 100);
  assert.ok(a.history.some((h) => h.includes('2026 result')));
});

test('browser review: answer texts show readable dates, and shrinking earnings appear once', () => {
  const shrinking = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 40 * 0.9 ** i, pe: 20 }));
  const c = company({ years: shrinking });
  const a = analyze(c, 30, NOW);
  assert.strictEqual(a.history.filter((h) => h.includes('shrank')).length + a.reasons.filter((r) => r.text.includes('shrank')).length, 1);
  const q = require('./lib/analysis').fourQuestions(c, a, null, { latest: { cashPct: 10, recordDate: '2026-11-16' }, nextExpected: '2027-10' });
  assert.ok(q[3].text.includes('16 Nov 2026'), q[3].text);
});
