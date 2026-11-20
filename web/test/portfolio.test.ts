import test from 'node:test';
import assert from 'node:assert';
import { parseLots, aggregateLots, parseCsv, toCsv, projectIncome, monthlyIncomeMap, dedupLots, pickDividend, dhakaDateString, nextPaymentMonth, CSV_MAX_ROWS } from '../lib/portfolio.ts';

// --- parseLots ---

test('parseLots: empty / null / bad JSON returns empty array', () => {
  for (const raw of [null, '', 'not json', '{}', '42', '[[]]']) {
    assert.deepStrictEqual(parseLots(raw), [], String(raw));
  }
});

test('parseLots: valid lots parsed and uppercased', () => {
  const raw = JSON.stringify([{ code: 'aciformula', shares: 100, buyPrice: 120.5 }]);
  const [lot] = parseLots(raw);
  assert.strictEqual(lot.code, 'ACIFORMULA');
  assert.strictEqual(lot.shares, 100);
  assert.strictEqual(lot.buyPrice, 120.5);
});

test('parseLots: invalid lots dropped — bad code, non-integer shares, zero/negative price', () => {
  const raw = JSON.stringify([
    { code: '<script>', shares: 10, buyPrice: 50 },
    { code: 'GP', shares: 1.5, buyPrice: 50 },
    { code: 'GP', shares: 0, buyPrice: 50 },
    { code: 'GP', shares: 10, buyPrice: -5 },
    { code: 'GP', shares: 10, buyPrice: 0 },
    { code: 'VALID', shares: 10, buyPrice: 50 },
  ]);
  const lots = parseLots(raw);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].code, 'VALID');
});

test('parseLots: buyDate validated and set only when ISO format', () => {
  const raw = JSON.stringify([
    { code: 'GP', shares: 10, buyPrice: 50, buyDate: '2024-01-15' },
    { code: 'GP', shares: 10, buyPrice: 50, buyDate: 'not-a-date' },
  ]);
  const lots = parseLots(raw);
  assert.strictEqual(lots[0].buyDate, '2024-01-15');
  assert.strictEqual(lots[1].buyDate, undefined);
});

test('parseLots: multiple lots for same code preserved', () => {
  const raw = JSON.stringify([
    { code: 'GP', shares: 100, buyPrice: 50 },
    { code: 'GP', shares: 200, buyPrice: 60 },
  ]);
  const lots = parseLots(raw);
  assert.strictEqual(lots.length, 2);
  assert.strictEqual(lots[0].code, 'GP');
  assert.strictEqual(lots[1].code, 'GP');
});

// --- aggregateLots ---

test('aggregateLots: single lot with live price', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const live = { GP: { price: 60, changePct: 2 } };
  const [h] = aggregateLots(lots, live);
  assert.strictEqual(h.totalShares, 100);
  assert.strictEqual(h.cost, 5000);
  assert.strictEqual(h.value, 6000);
  assert.strictEqual(h.pl, 1000);
  assert.ok(Math.abs(h.plPct! - 20) < 0.01, `plPct expected ~20, got ${h.plPct}`);
});

test('aggregateLots: two lots for same code — weighted avg buy price', () => {
  const lots = [
    { code: 'GP', shares: 100, buyPrice: 50 },
    { code: 'GP', shares: 100, buyPrice: 70 },
  ];
  const live = { GP: { price: 60, changePct: 0 } };
  const [h] = aggregateLots(lots, live);
  assert.strictEqual(h.totalShares, 200);
  assert.strictEqual(h.cost, 12000);
  assert.strictEqual(h.avgBuyPrice, 60);
  assert.strictEqual(h.pl, 0);
});

test('aggregateLots: no live price — value and pl are null', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const [h] = aggregateLots(lots, {});
  assert.strictEqual(h.livePrice, null);
  assert.strictEqual(h.value, null);
  assert.strictEqual(h.pl, null);
  assert.strictEqual(h.plPct, null);
  assert.strictEqual(h.cost, 5000);
});

test('aggregateLots: separate holdings per code', () => {
  const lots = [
    { code: 'GP', shares: 100, buyPrice: 50 },
    { code: 'ACI', shares: 200, buyPrice: 180 },
  ];
  const holdings = aggregateLots(lots, {});
  assert.strictEqual(holdings.length, 2);
  assert.ok(holdings.some((h) => h.code === 'GP'));
  assert.ok(holdings.some((h) => h.code === 'ACI'));
});

test('aggregateLots: dailyPl is null when changePct is -100 (Infinity guard)', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const live = { GP: { price: 0, changePct: -100 } };
  const [h] = aggregateLots(lots, live);
  assert.strictEqual(h.dailyPl, null, 'dailyPl should be null when changePct=-100 produces Infinity');
});

test('aggregateLots: dailyPl is null when NaN (changePct produces NaN)', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const live = { GP: { price: 50, changePct: NaN } };
  const [h] = aggregateLots(lots, live);
  assert.strictEqual(h.dailyPl, null, 'dailyPl should be null when NaN');
});

// --- parseCsv ---

test('parseCsv: standard headers, recognizes code/symbol, shares/quantity, buy price', () => {
  const csv = `code,quantity,avg cost\nGP,100,50\nACI,200,180`;
  const { lots, skipped } = parseCsv(csv);
  assert.strictEqual(lots.length, 2);
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(lots[0].code, 'GP');
  assert.strictEqual(lots[0].shares, 100);
  assert.strictEqual(lots[0].buyPrice, 50);
});

test('parseCsv: alternate headers — symbol, qty, avg price', () => {
  const csv = `symbol,qty,avg price\nSQURPHARMA,50,25.5`;
  const { lots } = parseCsv(csv);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].code, 'SQURPHARMA');
  assert.strictEqual(lots[0].shares, 50);
  assert.strictEqual(lots[0].buyPrice, 25.5);
});

test('parseCsv: thousand separators and ৳ sign stripped', () => {
  const csv = `Code,Shares,Buy Price\nACI,1000,"৳1,250.50"`;
  const { lots } = parseCsv(csv);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].shares, 1000);
  assert.ok(Math.abs(lots[0].buyPrice - 1250.5) < 0.01, `buyPrice expected ~1250.5, got ${lots[0].buyPrice}`);
});

test('parseCsv: quoted fields with commas inside', () => {
  const csv = `code,shares,avg cost\n"ACI,TEST",100,50`;
  const { lots, skipped } = parseCsv(csv);
  // "ACI,TEST" is not a valid code per CODE_RE; should be skipped
  assert.strictEqual(lots.length, 0);
  assert.strictEqual(skipped.length, 1);
});

test('parseCsv: summary rows (no valid code) are skipped', () => {
  const csv = `Code,Quantity,Avg Cost\nGP,100,50\nTotal,,,\n,,\nACI,50,180`;
  const { lots, skipped } = parseCsv(csv);
  assert.strictEqual(lots.length, 2);
  // blank and "Total" rows are skipped (blank skipped silently, Total with invalid quantity)
  assert.ok(skipped.some((s) => s.original.includes('Total')));
});

test('parseCsv: no recognizable header returns skipped result', () => {
  const csv = `col1,col2,col3\nfoo,bar,baz`;
  const { lots, skipped } = parseCsv(csv);
  assert.strictEqual(lots.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.ok(skipped[0].reason.includes('No recognizable header'));
});

test('parseCsv: missing buy price skips the row', () => {
  const csv = `code,shares\nGP,100`;
  const { lots, skipped } = parseCsv(csv);
  assert.strictEqual(lots.length, 0);
  assert.ok(skipped[0].reason.includes('Missing buy price'));
});

test('parseCsv: semicolon delimiter detected and parsed', () => {
  const csv = `code;quantity;avg cost\nGP;100;50\nACI;200;180`;
  const { lots, skipped } = parseCsv(csv);
  assert.strictEqual(lots.length, 2, 'should parse 2 lots from semicolon CSV');
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(lots[0].code, 'GP');
  assert.strictEqual(lots[1].code, 'ACI');
});

test('parseCsv: tab delimiter detected and parsed', () => {
  const csv = `code\tquantity\tavg cost\nGP\t100\t50`;
  const { lots, skipped } = parseCsv(csv);
  assert.strictEqual(lots.length, 1, 'should parse 1 lot from tab-delimited CSV');
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(lots[0].code, 'GP');
  assert.strictEqual(lots[0].shares, 100);
});

test('parseCsv: "Avg. Cost" header (period normalization) maps to price', () => {
  const csv = `Symbol;Qty;Avg. Cost\nGP;100;52.5`;
  const { lots } = parseCsv(csv);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].buyPrice, 52.5);
});

test('parseCsv: "Average price" header maps to price', () => {
  const csv = `code,shares,Average price\nGP,100,52.5`;
  const { lots } = parseCsv(csv);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].buyPrice, 52.5);
});

test('parseCsv: unquoted 1,000 in comma CSV causes column count error', () => {
  const csv = `code,shares,avg cost\nGP,1000,1,250.50`;
  const { lots, skipped } = parseCsv(csv);
  // Should NOT silently import wrong values; either skip or report clearly
  if (lots.length > 0) {
    // If imported, verify it didn't get price=1 silently
    assert.ok(lots[0].buyPrice !== 1, 'Should not silently import price=1 from unquoted 1,000');
  } else {
    assert.ok(skipped.length > 0, 'Should skip the row with a reason');
    assert.ok(skipped[0].reason.toLowerCase().includes('column') || skipped[0].reason.toLowerCase().includes('invalid'),
      `Expected column/invalid error, got: ${skipped[0].reason}`);
  }
});

test('parseCsv: knownCodes filters out codes not in company list', () => {
  const csv = `code,shares,avg cost\nGP,100,50\nFAKECO,200,30`;
  const knownCodes = new Set(['GP']);
  const { lots, skipped } = parseCsv(csv, knownCodes);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].code, 'GP');
  assert.ok(skipped.some((s) => s.reason.includes('FAKECO') && s.reason.includes('company list')));
});

// --- toCsv ---

test('toCsv: round-trips via parseCsv', () => {
  const lots = [
    { code: 'GP', shares: 100, buyPrice: 50, buyDate: '2024-01-15' },
    { code: 'ACI', shares: 200, buyPrice: 180 },
  ];
  const csv = toCsv(lots);
  const { lots: parsed } = parseCsv(csv);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].code, 'GP');
  assert.strictEqual(parsed[0].buyDate, '2024-01-15');
  assert.strictEqual(parsed[1].code, 'ACI');
});

// --- dedupLots ---

test('dedupLots: returns all when no duplicates', () => {
  const incoming = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const existing = [{ code: 'ACI', shares: 200, buyPrice: 180 }];
  const { unique, skippedCount } = dedupLots(incoming, existing);
  assert.strictEqual(unique.length, 1);
  assert.strictEqual(skippedCount, 0);
});

test('dedupLots: skips exact duplicate (same code/shares/price/date)', () => {
  const lot = { code: 'GP', shares: 100, buyPrice: 50, buyDate: '2024-01-01' };
  const { unique, skippedCount } = dedupLots([lot], [lot]);
  assert.strictEqual(unique.length, 0);
  assert.strictEqual(skippedCount, 1);
});

test('dedupLots: different price is not a duplicate', () => {
  const incoming = [{ code: 'GP', shares: 100, buyPrice: 55 }];
  const existing = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const { unique, skippedCount } = dedupLots(incoming, existing);
  assert.strictEqual(unique.length, 1);
  assert.strictEqual(skippedCount, 0);
});

test('dedupLots: missing buyDate treated same as empty string', () => {
  const incoming = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const existing = [{ code: 'GP', shares: 100, buyPrice: 50, buyDate: undefined }];
  const { unique, skippedCount } = dedupLots(incoming, existing);
  assert.strictEqual(unique.length, 0, 'undefined vs missing buyDate should be treated the same');
  assert.strictEqual(skippedCount, 1);
});

// --- pickDividend ---

test('pickDividend: prefers upcoming row (recordDate >= today)', () => {
  const rows = [
    { code: 'GP', cashPerShare: 1, recordDate: '2020-01-01', nextExpected: null },
    { code: 'GP', cashPerShare: 2, recordDate: '2099-12-31', nextExpected: null },
  ];
  const result = pickDividend(rows, 'GP', '2025-01-01');
  assert.strictEqual(result?.cashPerShare, 2, 'should pick upcoming row');
});

test('pickDividend: falls back to expected when no upcoming', () => {
  const rows = [
    { code: 'GP', cashPerShare: 1, recordDate: '2020-01-01', nextExpected: null },
    { code: 'GP', cashPerShare: 3, recordDate: null, nextExpected: '2026-06' },
  ];
  const result = pickDividend(rows, 'GP', '2025-01-01');
  assert.strictEqual(result?.cashPerShare, 3, 'should pick expected row over recent');
});

test('pickDividend: falls back to recent when no upcoming or expected', () => {
  const rows = [
    { code: 'GP', cashPerShare: 1, recordDate: '2020-01-01', nextExpected: null },
  ];
  const result = pickDividend(rows, 'GP', '2025-01-01');
  assert.strictEqual(result?.cashPerShare, 1, 'should fall back to recent');
});

test('pickDividend: skips rows with null/zero cashPerShare', () => {
  const rows = [
    { code: 'GP', cashPerShare: 0, recordDate: '2099-12-31', nextExpected: null },
    { code: 'GP', cashPerShare: null, recordDate: null, nextExpected: '2026-06' },
    { code: 'GP', cashPerShare: 2.5, recordDate: '2020-01-01', nextExpected: null },
  ];
  const result = pickDividend(rows, 'GP', '2025-01-01');
  assert.strictEqual(result?.cashPerShare, 2.5, 'should skip zero and null cashPerShare');
});

test('pickDividend: returns undefined when no match for code', () => {
  const rows = [{ code: 'ACI', cashPerShare: 1, recordDate: '2099-12-31', nextExpected: null }];
  const result = pickDividend(rows, 'GP', '2025-01-01');
  assert.strictEqual(result, undefined);
});

// --- projectIncome ---

test('projectIncome: returns income for lots with matching dividend', () => {
  const lots = [{ code: 'GP', shares: 1000, buyPrice: 50 }];
  const dividends = [{ code: 'GP', cashPerShare: 2.5, recordDate: '2025-06-30', nextExpected: null }];
  const [inc] = projectIncome(lots, dividends, '2025-01-01');
  assert.strictEqual(inc.code, 'GP');
  assert.strictEqual(inc.yearlyIncome, 2500);
  assert.strictEqual(inc.month, '2025-06');
});

test('projectIncome: uses nextExpected when no recordDate', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const dividends = [{ code: 'GP', cashPerShare: 1, recordDate: null, nextExpected: '2026-03' }];
  const [inc] = projectIncome(lots, dividends, '2025-01-01');
  assert.strictEqual(inc.month, '2026-03');
});

test('projectIncome: null income when dividend missing', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const [inc] = projectIncome(lots, [], '2025-01-01');
  assert.strictEqual(inc.yearlyIncome, null);
  assert.strictEqual(inc.month, null);
  assert.strictEqual(inc.cashPerShare, null);
});

test('projectIncome: zero cashPerShare treated as missing', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const dividends = [{ code: 'GP', cashPerShare: 0, recordDate: '2025-06-30', nextExpected: null }];
  const [inc] = projectIncome(lots, dividends, '2025-01-01');
  assert.strictEqual(inc.yearlyIncome, null);
});

test('projectIncome: uses upcoming over recent when both present', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 50 }];
  const dividends = [
    { code: 'GP', cashPerShare: 1, recordDate: '2020-01-01', nextExpected: null },
    { code: 'GP', cashPerShare: 3, recordDate: '2099-06-30', nextExpected: null },
  ];
  const [inc] = projectIncome(lots, dividends, '2025-01-01');
  assert.strictEqual(inc.cashPerShare, 3, 'should prefer upcoming row');
});

test('M3 projectIncome: an interim + final payer (GP) gets the 12-month cash as yearly income, one payment as next', () => {
  const lots = [{ code: 'GP', shares: 100, buyPrice: 250 }];
  // GP 2026: final 105% (Feb) + interim 105% (Jul) on face 10 = ৳21 a year; the next row is one ৳10.5 payment.
  const dividends = [{ code: 'GP', cashPerShare: 10.5, yearlyCashPerShare: 21, recordDate: null, nextExpected: '2027-02' }];
  const [inc] = projectIncome(lots, dividends, '2026-11-20');
  assert.deepStrictEqual([inc.nextIncome, inc.yearlyIncome, inc.month], [1050, 2100, '2027-02']);
  assert.strictEqual(monthlyIncomeMap([inc]).get('2027-02'), 1050);
});

// --- dhakaDateString ---

test('dhakaDateString: returns YYYY-MM-DD format', () => {
  const result = dhakaDateString();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result), `Expected YYYY-MM-DD, got ${result}`);
});

test('dhakaDateString: adds 6 hours to UTC for Dhaka', () => {
  // UTC midnight Jan 1 = Jan 1 in Dhaka (06:00 Dhaka time)
  const utcMidnight = new Date('2025-01-01T00:00:00Z').getTime();
  assert.strictEqual(dhakaDateString(utcMidnight), '2025-01-01');
  // UTC 18:30 Jan 1 = Jan 2 in Dhaka (00:30 Dhaka time)
  const utcEveJan1 = new Date('2025-01-01T18:30:00Z').getTime();
  assert.strictEqual(dhakaDateString(utcEveJan1), '2025-01-02');
});

// --- monthlyIncomeMap ---

test('monthlyIncomeMap: sums income by month', () => {
  const incomes = [
    { code: 'GP', totalShares: 100, cashPerShare: 2, nextIncome: 200, yearlyIncome: 400, month: '2025-06' },
    { code: 'ACI', totalShares: 50, cashPerShare: 3, nextIncome: 150, yearlyIncome: 150, month: '2025-06' },
    { code: 'XY', totalShares: 10, cashPerShare: 5, nextIncome: 50, yearlyIncome: 50, month: '2025-09' },
  ];
  const map = monthlyIncomeMap(incomes);
  assert.strictEqual(map.get('2025-06'), 350);
  assert.strictEqual(map.get('2025-09'), 50);
  assert.strictEqual(map.size, 2);
});

test('parseCsv: trailing text, hex and exponent numbers are rejected', () => {
  const csv = `code,shares,avg cost\nGP,100abc,50\nACI,0x10,50\nBATBC,1e3,50\nLHB,100,50x\nBXPHARMA,100,50`;
  const { lots, skipped } = parseCsv(csv);
  assert.deepStrictEqual(lots.map((l) => l.code), ['BXPHARMA']);
  assert.strictEqual(skipped.length, 4);
});

test('parseCsv: shares beyond a safe integer are rejected', () => {
  const { lots, skipped } = parseCsv(`code,shares,avg cost\nGP,99999999999999999999,50`);
  assert.strictEqual(lots.length, 0);
  assert.ok(skipped[0].reason.includes('Invalid quantity'));
});

test('parseCsv: decimal comma in semicolon and tab files', () => {
  const semi = parseCsv(`code;shares;avg cost\nGP;100;226,70\nACI;1000;1.234,5`);
  assert.deepStrictEqual(semi.lots.map((l) => [l.shares, l.buyPrice]), [[100, 226.7], [1000, 1234.5]]);
  const tab = parseCsv(`code\tshares\tavg cost\nGP\t100\t52,5`);
  assert.strictEqual(tab.lots[0].buyPrice, 52.5);
});

test('parseCsv: comma thousands still work in a comma file', () => {
  const { lots } = parseCsv(`code,shares,avg cost\nGP,"1,000","1,250.50"`);
  assert.strictEqual(lots[0].shares, 1000);
  assert.strictEqual(lots[0].buyPrice, 1250.5);
});

test('parseCsv: exact header match wins over an earlier substring match', () => {
  const { lots } = parseCsv(`Stock name,Code,Quantity,Avg cost\nGrameenphone,GP,100,50`);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].code, 'GP');
});

test('parseCsv: escaped "" quotes inside a quoted field are kept as one quote', () => {
  const { lots } = parseCsv(`Name,Code,Quantity,Avg cost\n"Grameen ""GP"", Ltd",GP,100,50`);
  assert.strictEqual(lots.length, 1);
  assert.strictEqual(lots[0].code, 'GP');
  assert.strictEqual(lots[0].shares, 100);
});

test('parseCsv: more than CSV_MAX_ROWS data rows is refused with a clear message', () => {
  const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, () => 'GP,1,50').join('\n');
  const { lots, skipped } = parseCsv(`code,shares,avg cost\n${rows}`);
  assert.strictEqual(lots.length, 0);
  assert.ok(skipped[0].reason.includes('Too many rows'));
  assert.strictEqual(parseCsv(`code,shares,avg cost\n${rows.split('\n').slice(1).join('\n')}`).lots.length, CSV_MAX_ROWS);
});

test('nextPaymentMonth: upcoming record date, else expected month, else null', () => {
  const base = { code: 'GP', cashPerShare: 10 };
  assert.strictEqual(nextPaymentMonth({ ...base, recordDate: '2026-12-03', nextExpected: '2027-02' }, '2026-11-20'), '2026-12');
  assert.strictEqual(nextPaymentMonth({ ...base, recordDate: '2026-03-03', nextExpected: '2027-02' }, '2026-11-20'), '2027-02');
  assert.strictEqual(nextPaymentMonth({ ...base, recordDate: '2026-03-03', nextExpected: null }, '2026-11-20'), null);
});

// --- financial trend cards (lib/financial-trends.ts) ---
import { trendSeries, cagr, roePct, payoutPct, pbAtYearEnd, profitCrore } from '../lib/financial-trends.ts';

test('financial trends: ROE, payout, P/B and profit unit formulas', () => {
  assert.strictEqual(roePct(10, 50), 20);
  assert.strictEqual(roePct(10, 0), null);
  assert.strictEqual(payoutPct(215, 10, 21.9)?.toFixed(1), '98.2');
  assert.strictEqual(payoutPct(100, 10, -1), null);
  assert.strictEqual(pbAtYearEnd(10, 5, 25), 2);
  assert.strictEqual(pbAtYearEnd(10, -5, 25), null);
  assert.strictEqual(profitCrore({ year: 2025, profit: 29576.54 }), 2957.654);
});

test('financial trends: years with missing inputs are skipped, never zero', () => {
  const years = [
    { year: 2021, eps: 2, nav: 20, profit: 100, pe: 10 },
    { year: 2022, eps: null, nav: 22, profit: null, pe: null },
    { year: 2023, eps: 4, nav: 25, profit: 300, pe: 8 },
  ];
  const t = trendSeries(years, [{ year: 2023, cash: 20 }], 10);
  assert.deepStrictEqual(t.eps.map((p) => p.year), [2021, 2023]);
  assert.deepStrictEqual(t.roe.map((p) => p.year), [2021, 2023]);
  assert.deepStrictEqual(t.payout, [{ year: 2023, value: 50 }]);
  assert.deepStrictEqual(t.profit.map((p) => p.value), [10, 30]);
  assert.strictEqual(t.pb.length, 2);
});

test('financial trends: CAGR over the span, null for non-positive ends', () => {
  const g = cagr([{ year: 2021, value: 100 }, { year: 2023, value: 121 }]);
  assert.strictEqual(g?.years, 2);
  assert.strictEqual(g?.pct.toFixed(1), '10.0');
  assert.strictEqual(cagr([{ year: 2021, value: -1 }, { year: 2023, value: 5 }]), null);
  assert.strictEqual(cagr([{ year: 2021, value: 5 }]), null);
});
