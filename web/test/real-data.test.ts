import test from 'node:test';
import assert from 'node:assert';
import { analyze, metrics, pricePosition, fourQuestions, dividendStatus, sectorMedians } from '../lib/analysis.ts';
import { tradingDaysBetween } from '../lib/dhaka.ts';
import { real } from './real-companies.ts';
import type { Company } from '../lib/types.ts';

const NOW = new Date('2026-11-20T06:00:00Z');
const run = (c: Company, sectorPe: number | null = null) => analyze(c, sectorPe, NOW);
const questions = (c: Company) => {
  const a = run(c);
  return fourQuestions(c, a, pricePosition(c, metrics(c, NOW)), dividendStatus(c.events, NOW));
};

test('A1 GP: yield is the cash declared in the last 12 months (interim + final) ÷ price', () => {
  const m = run(real('GP', { price: 226.7 })).metrics;
  assert.strictEqual(m.latestYield, 9.26);
  assert.strictEqual(m.yieldBasis, '৳21.0 cash in last 12 months: ৳10.5 Jul-26 interim + ৳10.5 Feb-26 final ÷ ৳226.7');
});

test('A1 BRACBANK: bonus shares are not cash', () => {
  assert.strictEqual(run(real('BRACBANK', { price: 66.6 })).metrics.latestYield, 2.25);
});

test('A1/A2 BNIPLC: the empty declaration is skipped and the yield is ~1.5%, not the DSE 4.92%', () => {
  const c = real('BNIPLC', { price: 146.3, dividendYield: 4.92 });
  assert.strictEqual(run(c).metrics.latestYield, 1.5);
  assert.strictEqual(dividendStatus(c.events, NOW).latest?.cashPct, 22);
  assert.ok(!questions(c)[3].text.includes('?%'), questions(c)[3].text);
});

test('A1: no declaration in the last 12 months gives 0; no declaration at all gives null', () => {
  const old = { declarations: [{ announced: '2024-10-01', cashPct: 50, interim: false }], directorTrades: [] };
  assert.strictEqual(run(real('HWAWELLTEX', { events: old })).metrics.latestYield, 0);
  assert.strictEqual(run(real('HWAWELLTEX', { events: { declarations: [] } })).metrics.latestYield, null);
});

test('A6 DELTALIFE: no EPS published is "not rated", never a loss or avoid', () => {
  const a = run(real('DELTALIFE'), 20);
  assert.strictEqual(a.notRated, true);
  assert.strictEqual(a.signal, 'neutral');
  assert.ok(a.score > 30);
  assert.ok(!a.reasons.some((r) => r.text.includes('made a loss')));
  assert.ok(a.suggestion.startsWith('Not rated — no EPS published'));
  assert.strictEqual(questions(real('DELTALIFE'))[0].answer, 'unknown');
});

test('A7/A8 BNIPLC: +224% price on +14.8% EPS is a pump and not worth researching', () => {
  const a = run(real('BNIPLC', { price: 146.3 }), 20);
  assert.notStrictEqual(a.signal, 'research');
  assert.ok(a.fraud.flags.some((f) => f.title === 'Fast price rise' && f.detail.includes('P/E rose')));
  const check = a.checks.find((x) => x.label === 'Price not stretched')!;
  assert.strictEqual(check.ok, false);
  // Usual P/E is the median of the last 5 (14.03), not the mean pulled up by 2021's 42: limit 1.5 × 14 = 21.
  assert.ok(check.detail.includes('limit 21'), check.detail);
});

test('A8: a price rise matched by the same EPS rise is not a pump', () => {
  const c = real('HWAWELLTEX', { years: [{ year: 2024, eps: 2, pe: 20 }, { year: 2025, eps: 4, pe: 11 }], price: 91 });
  assert.ok(!run(c).fraud.flags.some((f) => f.title === 'Fast price rise'));
});

test('A12 SHEPHERD: EPS −1.51 → 0.04 is not a sudden profit jump', () => {
  assert.ok(!run(real('SHEPHERD')).fraud.flags.some((f) => f.title === 'Sudden profit jump'));
});

test('A12 TITASGAS: a profitable latest quarter clears "loss-making but rising"', () => {
  const live = real('TITASGAS', { price: 23.4 });
  assert.ok(!run(live).fraud.flags.some((f) => f.title === 'Loss-making but rising'));
  const lossQ1 = real('TITASGAS', { price: 23.4, interim: { periods: { q1: '202609' }, eps: { q1: -1 } } });
  assert.ok(run(lossQ1).fraud.flags.some((f) => f.title === 'Loss-making but rising'));
});

test('A10 GP: cheap with falling profits is "partly", labelled "Cheap, but profits falling"', () => {
  const q = questions(real('GP', { price: 226.7 }))[1];
  assert.deepStrictEqual([q.answer, q.label], ['partly', 'Cheap, but profits falling']);
});

test('A10: without P/E history the cheap answer falls back to the 52-week range', () => {
  const q = questions(real('DELTALIFE'))[1];
  assert.strictEqual(q.answer, 'partly');
  assert.strictEqual(q.label, 'Near its 52-week low');
});

test('A10/B4: the fraud answer uses No flags / 1 flag pattern / {n} flag patterns', () => {
  assert.strictEqual(questions(real('GP'))[2].label, 'No flags');
  assert.strictEqual(questions(real('SHEPHERD'))[2].label, '1 flag pattern');
  assert.strictEqual(questions(real('GP', { category: 'Z' }))[2].label, '1 flag pattern');
  const twoFlags = real('GP', { category: 'Z', sharePattern: [{ date: '2025-01-01', sponsor: 50 }, { date: '2026-01-01', sponsor: 46 }] });
  assert.strictEqual(questions(twoFlags)[2].label, '{n} flag patterns');
});

test('A11: every signal carries a line for a holder', () => {
  const cases = [real('BRACBANK', { price: 66.6 }), real('GP'), real('DELTALIFE'), real('TITASGAS', { price: 23.4 })];
  assert.deepStrictEqual(cases.map((c) => run(c, 20).signal).sort(), ['avoid', 'caution', 'neutral', 'research']);
  for (const c of cases) assert.ok(run(c, 20).suggestion.includes('If you own it,'), c.code);
});

test('A15: "That is strong" needs EPS growth of 15% a year or more', () => {
  const at = (rate: number) => run(real('BRACBANK', { years: [2021, 2022, 2023, 2024, 2025].map((year, i) => ({ year, eps: 4 * (1 + rate) ** i, pe: 9 })) }));
  assert.ok(!at(0.12).history.some((h) => h.includes('That is strong')));
  assert.ok(at(0.2).history.some((h) => h.includes('That is strong')));
});

test('A9: the sector P/E is a true median of every positive P/E', () => {
  const m = sectorMedians([real('GP', { price: 219 }), real('GP', { code: 'B', price: 438 }), real('GP', { code: 'C', price: 2190 }), real('TITASGAS', { sector: 'Telecom' })], NOW);
  assert.strictEqual(m.Telecom, 20);
});

test('A20: DSE trading days count Sunday to Thursday, both ends included', () => {
  assert.strictEqual(tradingDaysBetween('2026-11-20', '2026-11-22'), 1);
  assert.strictEqual(tradingDaysBetween('2026-11-22', '2026-11-26'), 5);
  assert.strictEqual(tradingDaysBetween('2026-11-19', '2026-11-22'), 2);
  assert.strictEqual(tradingDaysBetween('2026-11-23', '2026-11-22'), 0);
});
