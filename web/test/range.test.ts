import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMatch, describeRule, gainFromBuyPct, parseRangeRules, rangeFeed, rangeStats, type RangeRow } from '../lib/range.ts';
import type { CompanyRow } from '../lib/service.ts';

const row = (code: string, price: number | null, low: number | null, high: number | null): RangeRow => ({ code, price, weekLow52: low, weekHigh52: high });

test('range stats: above the low, below the high and the position in the range', () => {
  assert.deepEqual(rangeStats(row('GP', 226.7, 221.9, 282)), { aboveLowPct: 2.2, belowHighPct: 19.6, position: (226.7 - 221.9) / (282 - 221.9) });
  assert.equal(rangeStats(row('X', 100, 100, 100))?.position, 0.5, 'a flat range sits in the middle');
  assert.equal(rangeStats(row('X', 90, 100, 200))?.position, 0, 'a price below a stale low is clamped');
  assert.equal(rangeStats(row('X', 90, 100, 200))?.aboveLowPct, -10);
});

test('range stats: missing or broken data gives no figures instead of a wrong one', () => {
  for (const r of [row('X', null, 1, 2), row('X', 5, null, 2), row('X', 5, 1, null), row('X', 5, 3, 2), row('X', 0, 1, 2), row('X', Number.NaN, 1, 2)]) {
    assert.equal(rangeStats(r), null);
  }
});

test('gain from the average buy price', () => {
  assert.equal(gainFromBuyPct(30, 25), 20);
  assert.equal(gainFromBuyPct(20, 25), -20);
  assert.equal(gainFromBuyPct(null, 25), null);
  assert.equal(gainFromBuyPct(30, 0), null);
});

const rows = [row('GP', 226.7, 221.9, 282), row('ROBI', 30, 25, 40), row('SQURPHARMA', 210, 180, 215), row('BAD', null, 1, 2)];
const input = { rows, watchlist: ['ROBI'], holdings: [{ code: 'ROBI', shares: 10, avgCost: 25 }, { code: 'GP', shares: 0, avgCost: 300 }] };

test('feed: near-low and near-high rules, each sorted closest first', () => {
  const feed = rangeFeed([{ id: 'a', kind: 'nearLow', pct: 25, scope: 'all' }, { id: 'b', kind: 'nearHigh', pct: 5, scope: 'all' }], input);
  assert.deepEqual(feed.map((m) => [m.rule.id, m.code, m.valuePct]), [['a', 'GP', 2.2], ['a', 'SQURPHARMA', 16.7], ['a', 'ROBI', 20], ['b', 'SQURPHARMA', 2.3]]);
});

test('feed: scopes limit the companies; sold-out holdings do not count', () => {
  assert.deepEqual(rangeFeed([{ id: 'a', kind: 'nearLow', pct: 50, scope: 'watchlist' }], input).map((m) => m.code), ['ROBI']);
  assert.deepEqual(rangeFeed([{ id: 'a', kind: 'nearLow', pct: 50, scope: 'holdings' }], input).map((m) => m.code), ['ROBI'], 'GP has 0 shares');
});

test('feed: rules about my buy price use only holdings, and their own threshold', () => {
  assert.deepEqual(rangeFeed([{ id: 'u', kind: 'upFromBuy', pct: 20, scope: 'all' }], input).map((m) => [m.code, m.valuePct]), [['ROBI', 20]]);
  assert.deepEqual(rangeFeed([{ id: 'u', kind: 'upFromBuy', pct: 21, scope: 'all' }], input), []);
  const down = rangeFeed([{ id: 'd', kind: 'downFromBuy', pct: 10, scope: 'all' }], { ...input, holdings: [{ code: 'GP', shares: 5, avgCost: 300 }] });
  assert.deepEqual(down.map((m) => [m.code, m.valuePct]), [['GP', 24.4]]);
});

test('rules from storage: malformed, duplicate, out-of-range or extra rules are dropped', () => {
  const parsed = parseRangeRules([
    { id: 'ok', kind: 'nearLow', pct: '5', scope: 'all' },
    { id: 'ok', kind: 'nearHigh', pct: 5, scope: 'all' },
    { id: 'bad kind', kind: 'buyNow', pct: 5, scope: 'all' },
    { id: 'tiny', kind: 'nearLow', pct: 0.1, scope: 'all' },
    { id: 'huge', kind: 'nearLow', pct: 500, scope: 'all' },
    { id: 'scope', kind: 'nearLow', pct: 5, scope: 'everyone' },
    { id: 'buy', kind: 'upFromBuy', pct: 12.34, scope: 'all' },
    null, 'x', 5,
  ]);
  assert.deepEqual(parsed, [{ id: 'ok', kind: 'nearLow', pct: 5, scope: 'all' }, { id: 'buy', kind: 'upFromBuy', pct: 12.3, scope: 'holdings' }]);
  assert.deepEqual(parseRangeRules('nope'), []);
  assert.equal(parseRangeRules(Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, kind: 'nearLow', pct: 5, scope: 'all' }))).length, 20);
});

test('match wording is factual and covers a price outside the range', () => {
  const rule = { id: 'a', kind: 'nearLow' as const, pct: 5, scope: 'all' as const };
  assert.equal(describeMatch({ rule, code: 'GP', valuePct: 2.2 }), '2.2% above its 52-week low');
  assert.equal(describeMatch({ rule, code: 'GP', valuePct: -1 }), '1% below its 52-week low');
  assert.equal(describeMatch({ rule: { ...rule, kind: 'downFromBuy' }, code: 'GP', valuePct: 24.4 }), 'down 24.4% from your average buy price');
  assert.doesNotMatch(describeMatch({ rule, code: 'GP', valuePct: 2 }), /buy now|sell now|you should/i);
});

test('near rules: a price outside a stale range is not "near", and the threshold itself matches', () => {
  const rule = (kind: 'nearLow' | 'nearHigh', pct: number) => [{ id: 'r', kind, pct, scope: 'all' as const }];
  const stale = { rows: [row('DOWN', 60, 100, 200), row('UP', 250, 100, 200)], watchlist: [], holdings: [] };
  assert.deepEqual(rangeFeed(rule('nearLow', 50), stale), [], 'far below an old low is not near it');
  assert.deepEqual(rangeFeed(rule('nearHigh', 50), stale), [], 'far above an old high is not near it');
  const edge = { rows: [row('EQ', 105, 100, 200), row('FLAT', 100, 100, 100)], watchlist: [], holdings: [] };
  assert.deepEqual(rangeFeed(rule('nearLow', 5), edge).map((m) => m.code), ['FLAT', 'EQ'], 'exactly 5% above matches a 5% rule; a flat range sits at the low');
  assert.deepEqual(rangeFeed(rule('nearHigh', 0.5), edge).map((m) => m.code), ['FLAT'], 'a flat range is also at its high');
});

test('matching uses the exact value, not the rounded one', () => {
  const r = [{ id: 'r', kind: 'nearLow' as const, pct: 5, scope: 'all' as const }];
  assert.deepEqual(rangeFeed(r, { rows: [row('X', 105.04, 100, 200)], watchlist: [], holdings: [] }), [], '5.04% is not within 5%');
  assert.equal(rangeFeed(r, { rows: [row('X', 104.96, 100, 200)], watchlist: [], holdings: [] })[0].valuePct, 5, 'shown rounded');
});

test('broken holdings never count as owned', () => {
  const r = [{ id: 'u', kind: 'upFromBuy' as const, pct: 1, scope: 'holdings' as const }];
  for (const h of [{ shares: Number.NaN, avgCost: 25 }, { shares: 0, avgCost: 25 }, { shares: 10, avgCost: Number.POSITIVE_INFINITY }, { shares: 10, avgCost: 0 }]) {
    assert.deepEqual(rangeFeed(r, { rows: [row('ROBI', 30, 25, 40)], watchlist: [], holdings: [{ code: 'ROBI', ...h }] }), [], JSON.stringify(h));
  }
  const down = [{ id: 'd', kind: 'downFromBuy' as const, pct: 5, scope: 'holdings' as const }];
  assert.deepEqual(rangeFeed(down, { rows: [row('ROBI', 30, 25, 40)], watchlist: [], holdings: [{ code: 'ROBI', shares: 10, avgCost: 25 }] }), [], 'a price rise is not "down from buy"');
});

test('rules from storage: odd ids and number formats are refused; the first of duplicate ids wins', () => {
  const base = { kind: 'nearLow', scope: 'all' };
  const parsed = parseRangeRules([
    { ...base, id: '__proto__', pct: 5 }, { ...base, id: 'has space', pct: 5 }, { ...base, id: 'x'.repeat(41), pct: 5 }, { ...base, id: 7, pct: 5 },
    { ...base, id: 'hex', pct: '0x10' }, { ...base, id: 'exp', pct: '1e1' }, { ...base, id: 'bool', pct: true }, { ...base, id: 'blank', pct: ' ' }, { ...base, id: 'nul', pct: null },
    { ...base, id: 'first', pct: 3 }, { ...base, id: 'first', pct: 9 }, { ...base, id: 'spaced', pct: ' 7.5 ' },
  ]);
  assert.deepEqual(parsed.map((r) => [r.id, r.pct]), [['first', 3], ['spaced', 7.5]]);
  assert.deepEqual(parseRangeRules({ id: 'a' }), []);
  assert.deepEqual(parseRangeRules(undefined), []);
});

test('rule wording names the threshold and the scope', () => {
  assert.equal(describeRule({ id: 'a', kind: 'nearHigh', pct: 5, scope: 'watchlist' }), 'within 5% of the 52-week high (your watchlist)');
  assert.equal(describeRule({ id: 'a', kind: 'downFromBuy', pct: 8, scope: 'holdings' }), 'down 8% or more from your buy (your holdings)');
});

const companyRow = (code: string, price: number | null, low: number | null, high: number | null, over: Partial<CompanyRow> = {}): CompanyRow => ({
  code, name: code, sector: 'Banks', category: 'A', price, changePct: 0, signal: 'research', score: 50, quality: 'medium',
  fraud: 'clean', flags: [], pe: 10, dividendYield: 2, epsCagr: 5, change1y: 0, dailyValue: 2_000_000,
  weekHigh52: high, weekLow52: low, stale: false, ...over,
} as CompanyRow);

const companies: CompanyRow[] = [
  companyRow('GP', 226.7, 221.9, 282, { signal: 'research' }),
  companyRow('ROBI', 30, 25, 40, { signal: 'avoid' }),
];

test('pick filtering: a rule with pick=good only matches companies that pass the good pick', () => {
  const rule = { id: 'r', kind: 'nearLow' as const, pct: 25, scope: 'all' as const, pick: 'good' as const };
  const result = rangeFeed([rule], { rows: companies, watchlist: [], holdings: [], companies });
  assert.deepEqual(result.map((m) => m.code), ['GP'], 'ROBI has signal=avoid and fails good');
});

test('pick filtering: a rule with a pick never falls open when no company list is given', () => {
  const rule = { id: 'r', kind: 'nearLow' as const, pct: 25, scope: 'all' as const, pick: 'good' as const };
  assert.deepEqual(rangeFeed([rule], { rows: companies, watchlist: [], holdings: [] }), [], 'no company list: the pick cannot be checked, so nothing matches');
  const plain = { id: 'p', kind: 'nearLow' as const, pct: 25, scope: 'all' as const };
  assert.equal(rangeFeed([plain], { rows: companies, watchlist: [], holdings: [] }).length, 2, 'a rule without a pick still works');
});

test('parseRangeRules: a valid pick is kept; an unknown pick is dropped from the field but the rule is kept', () => {
  const good = parseRangeRules([{ id: 'r1', kind: 'nearLow', pct: 5, scope: 'all', pick: 'good' }]);
  assert.deepEqual(good, [{ id: 'r1', kind: 'nearLow', pct: 5, scope: 'all', pick: 'good' }]);

  const bogus = parseRangeRules([{ id: 'r2', kind: 'nearLow', pct: 5, scope: 'all', pick: 'bogus' }]);
  assert.deepEqual(bogus, [{ id: 'r2', kind: 'nearLow', pct: 5, scope: 'all' }], 'rule kept, pick dropped');
});

test('describeRule mentions the pick label when present', () => {
  assert.equal(describeRule({ id: 'a', kind: 'nearLow', pct: 10, scope: 'all', pick: 'good' }), 'within 10% of the 52-week low, Good companies (all companies)');
  assert.equal(describeRule({ id: 'a', kind: 'nearLow', pct: 5, scope: 'all' }), 'within 5% of the 52-week low (all companies)', 'no pick: unchanged format');
});
