import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUICK_PICKS, QUICK_PICK_KEYS, matchesPick, type QuickPickKey } from '../lib/quick-picks.ts';
import type { CompanyRow } from '../lib/service.ts';

const row = (over: Partial<CompanyRow>): CompanyRow => ({
  code: 'X', name: 'X', sector: 'Banks', category: 'A',
  price: 100, changePct: 0, signal: 'research', score: 50, quality: 'medium',
  fraud: 'clean', flags: [], pe: 10, dividendYield: 2, epsCagr: 5,
  change1y: 10, dailyValue: 2_000_000, weekHigh52: 150, weekLow52: 80, stale: false,
  ...over,
} as CompanyRow);

const rows: CompanyRow[] = [
  row({ code: 'A', sector: 'Banks', signal: 'research', pe: 8, dividendYield: 6, dailyValue: 2_000_000, fraud: 'clean', epsCagr: 20 }),
  row({ code: 'B', sector: 'Banks', signal: 'research', pe: 10, dividendYield: 1, dailyValue: 500_000, fraud: 'clean', epsCagr: 10 }),
  row({ code: 'C', sector: 'Banks', signal: 'research', pe: 15, dividendYield: 1, dailyValue: 500_000, fraud: 'clean', epsCagr: 5 }),
  row({ code: 'D', sector: 'Banks', signal: 'avoid', pe: 5, dividendYield: 1, dailyValue: 500_000, fraud: 'suspicious', epsCagr: -5 }),
];

test('QUICK_PICKS has five picks with the expected keys', () => {
  assert.deepEqual(QUICK_PICK_KEYS, ['good', 'cheap', 'dividend', 'growth', 'avoid']);
  assert.equal(QUICK_PICKS.length, 5);
  for (const p of QUICK_PICKS) {
    assert.ok(p.key && p.label && p.hint && p.sort && p.dir);
    assert.equal(typeof p.test, 'function');
  }
});

test('good: passes when signal is research', () => {
  const pick = QUICK_PICKS.find((p) => p.key === 'good')!;
  assert.equal(pick.test(row({ signal: 'research' }), {}), true);
  assert.equal(pick.test(row({ signal: 'avoid' }), {}), false);
  assert.equal(pick.test(row({ signal: 'neutral' }), {}), false);
});

test('cheap: passes when signal is research AND P/E at or below sector median', () => {
  const pick = QUICK_PICKS.find((p) => p.key === 'cheap')!;
  const m = { Banks: 12 };
  assert.equal(pick.test(row({ signal: 'research', sector: 'Banks', pe: 10 }), m), true, 'pe below median');
  assert.equal(pick.test(row({ signal: 'research', sector: 'Banks', pe: 12 }), m), true, 'pe equals median');
  assert.equal(pick.test(row({ signal: 'research', sector: 'Banks', pe: 13 }), m), false, 'pe above median');
  assert.equal(pick.test(row({ signal: 'avoid', sector: 'Banks', pe: 10 }), m), false, 'wrong signal');
  assert.equal(pick.test(row({ signal: 'research', sector: 'Banks', pe: null }), m), false, 'null pe');
  assert.equal(pick.test(row({ signal: 'research', sector: 'Other', pe: 10 }), m), false, 'no median for sector');
});

test('dividend: passes when yield >= 5%, clean, and liquid', () => {
  const pick = QUICK_PICKS.find((p) => p.key === 'dividend')!;
  assert.equal(pick.test(row({ dividendYield: 5, fraud: 'clean', dailyValue: 1_000_000 }), {}), true);
  assert.equal(pick.test(row({ dividendYield: 4.9, fraud: 'clean', dailyValue: 1_000_000 }), {}), false, 'yield too low');
  assert.equal(pick.test(row({ dividendYield: 6, fraud: 'suspicious', dailyValue: 1_000_000 }), {}), false, 'not clean');
  assert.equal(pick.test(row({ dividendYield: 6, fraud: 'clean', dailyValue: 999_999 }), {}), false, 'not liquid');
  assert.equal(pick.test(row({ dividendYield: null as unknown as number, fraud: 'clean', dailyValue: 1_000_000 }), {}), false, 'null yield');
});

test('growth: passes when epsCagr >= 15 and no warning sign', () => {
  const pick = QUICK_PICKS.find((p) => p.key === 'growth')!;
  assert.equal(pick.test(row({ epsCagr: 15, fraud: 'clean' }), {}), true);
  assert.equal(pick.test(row({ epsCagr: 14.9, fraud: 'clean' }), {}), false, 'just under');
  assert.equal(pick.test(row({ epsCagr: 20, fraud: 'suspicious' }), {}), false, 'suspicious');
  assert.equal(pick.test(row({ epsCagr: null as unknown as number, fraud: 'clean' }), {}), false, 'null cagr');
});

test('avoid: passes when signal is avoid', () => {
  const pick = QUICK_PICKS.find((p) => p.key === 'avoid')!;
  assert.equal(pick.test(row({ signal: 'avoid' }), {}), true);
  assert.equal(pick.test(row({ signal: 'research' }), {}), false);
});

test('matchesPick returns false for an unknown key', () => {
  assert.equal(matchesPick('bogus' as QuickPickKey, rows[0], rows), false);
});

test('matchesPick: cheap computes sector medians from rows', () => {
  // Banks: pe values [8,10,15,5] → sorted [5,8,10,15] → median=(8+10)/2=9; A(pe 8)<=9 passes, B(pe 10)>9 fails
  assert.equal(matchesPick('cheap', rows[0], rows), true, 'A: pe 8 <= median 9');
  assert.equal(matchesPick('cheap', rows[1], rows), false, 'B: pe 10 > median 9');
  assert.equal(matchesPick('cheap', rows[3], rows), false, 'D: avoid signal');
});

test('matchesPick: good uses signal field', () => {
  assert.equal(matchesPick('good', rows[0], rows), true);
  assert.equal(matchesPick('good', rows[3], rows), false);
});

test('matchesPick: sector with fewer than 3 companies gives null median (cheap fails)', () => {
  const twoRows = [
    row({ code: 'X1', sector: 'Lone', signal: 'research', pe: 5 }),
    row({ code: 'X2', sector: 'Lone', signal: 'research', pe: 8 }),
  ];
  assert.equal(matchesPick('cheap', twoRows[0], twoRows), false, 'no median under 3 companies');
});
