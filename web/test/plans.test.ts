import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boughtSince, planStatus, plansFromRows, planToRow, validatePlan, type SavedPlan } from '../lib/plans.ts';

const TODAY = '2026-11-20';
const ok = { code: 'gp', quantity: '10', boughtNow: '5', targetPrice: '222.20', until: '2026-11-30', note: '=split', status: '' };

test('a valid plan is cleaned: code upper-case, numbers parsed, formula prefix stripped, active by default', () => {
  const v = validatePlan(ok, TODAY);
  assert.ok(v.ok);
  if (v.ok) assert.deepEqual(v.value, { code: 'GP', quantity: 10, boughtNow: 5, targetPrice: 222.2, until: '2026-11-30', note: 'split', status: 'active' });
});

test('bad plans are refused with a plain reason', () => {
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ ...ok, code: 'not a code' }, /code/],
    [{ ...ok, quantity: '0' }, /Quantity/],
    [{ ...ok, boughtNow: '11' }, /already bought 11 shares/],
    [{ ...ok, targetPrice: '-1' }, /Target price/],
    [{ ...ok, targetPrice: '' }, /Set a target price/],
    [{ ...ok, until: '2026-11-19' }, /today or later/],
    [{ ...ok, until: '2026-02-30' }, /real date/],
    [{ ...ok, status: 'maybe' }, /Status/],
  ];
  for (const [input, msg] of bad) {
    const r = validatePlan(input, TODAY);
    assert.ok(!r.ok && msg.test(r.error), JSON.stringify(input));
  }
  assert.ok(validatePlan({ ...ok, boughtNow: '10', targetPrice: '' }, TODAY).ok, 'a fully bought plan needs no target');
  assert.ok(validatePlan({ ...ok, until: '2026-11-01', status: 'done' }, TODAY).ok, 'an expired plan can still be marked done');
});

const saved = (over: Partial<SavedPlan> = {}): SavedPlan => ({ id: 'p1', code: 'GP', quantity: 10, boughtNow: 5, targetPrice: 222.2, until: '2026-11-30', note: '', status: 'active', createdAt: '2026-11-20T10:00:00Z', ...over });

test('live status: waiting with distance, reached at or under target, expired, done, cancelled', () => {
  assert.deepEqual([planStatus(saved(), 226.7, TODAY).status, planStatus(saved(), 226.7, TODAY).awayPct], ['waiting', 2]);
  assert.match(planStatus(saved(), 222.2, TODAY).text, /reached — buy the other 5 now/);
  assert.equal(planStatus(saved(), 220, '2026-12-01').status, 'expired');
  assert.equal(planStatus(saved({ status: 'done' }), 220, TODAY).status, 'done');
  assert.equal(planStatus(saved({ status: 'cancelled' }), 220, TODAY).status, 'cancelled');
  assert.equal(planStatus(saved({ boughtNow: 10 }), 220, TODAY).status, 'done');
  assert.equal(planStatus(saved(), null, TODAY).awayPct, null);
});

test('plans round-trip through sheet rows; an expired plan still reads back; bad rows are reported', () => {
  const p = saved({ until: '2026-01-01' });
  const { plans, badRows } = plansFromRows([planToRow(p), [], ['', 'GP', '1'], ['p2', 'GP', 'x']]);
  assert.deepEqual(plans.map(({ row, ...rest }) => [row, rest]), [[2, p]]);
  assert.deepEqual(badRows, [4, 5]);
});

test('boughtSince counts real buys of the plan company from the plan day (Dhaka date), capped at the quantity', () => {
  const plan = { code: 'GP', quantity: 10, createdAt: '2026-11-19T20:00:00Z' }; // 20 Nov 02:00 in Dhaka
  const t = (date: string, quantity: number, side = 'BUY', code = 'GP') => ({ code, side, quantity, date });
  assert.equal(boughtSince(plan, []), 0);
  assert.equal(boughtSince(plan, [t('2026-11-19', 4)]), 0, 'a buy before the plan day does not count');
  assert.equal(boughtSince(plan, [t('2026-11-20', 1)]), 1, 'a buy on the plan day counts');
  assert.equal(boughtSince(plan, [t('2026-11-21', 3), t('2026-11-22', 2, 'SELL'), t('2026-11-22', 5, 'BUY', 'ROBI')]), 3, 'sells and other codes do not count');
  assert.equal(boughtSince(plan, [t('2026-11-21', 8), t('2026-11-24', 8)]), 10, 'never more than the plan quantity');
  assert.equal(boughtSince({ ...plan, createdAt: 'not a date' }, [t('2020-01-01', 2)]), 2, 'an unreadable plan date counts every buy');
});
