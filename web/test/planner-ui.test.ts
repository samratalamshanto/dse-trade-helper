import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveSentence, plusTradingDays } from '../components/planner/plan-text.ts';

test('plusTradingDays skips Friday and Saturday', () => {
  assert.equal(plusTradingDays('2026-11-19', 1), '2026-11-22'); // Thursday -> Sunday
  assert.equal(plusTradingDays('2026-11-22', 10), '2026-12-06'); // two full Sun-Thu weeks
  assert.equal(plusTradingDays('2026-11-20', 0), '2026-11-20');
});

test('moveSentence states the past, compares fall and rise, and handles missing data', () => {
  const odds = [{ pct: 1, within: 5, fell: 41, rose: 30 }, { pct: 2, within: 5, fell: 24, rose: 16 }];
  assert.equal(moveSentence(odds), 'Over the last year, within 5 trading days a 2% fall was more common than a 2% rise (24% vs 16% of days).');
  assert.match(moveSentence([{ pct: 2, within: 5, fell: 10, rose: 20 }])!, /rise was more common/);
  assert.match(moveSentence([{ pct: 2, within: 5, fell: 10, rose: 10 }])!, /equally common/);
  assert.equal(moveSentence([{ pct: 2, within: 5, fell: null, rose: null }]), null);
  assert.equal(moveSentence([]), null);
});
