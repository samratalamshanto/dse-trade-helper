import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMatch, gainFromBuyPct, parseRangeRules, rangeFeed, rangeStats, type RangeRow } from '../lib/range.ts';

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
