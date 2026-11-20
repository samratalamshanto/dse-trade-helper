import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradeAll, isRight, scorecard, snapshotDue, validSnapshot, weakestGroup, type DaySnapshot } from '../lib/scorecard.ts';

const call = (code: string, signal: string, price: number) => ({ code, signal, score: 50, fraud: 'clean', price });
const day = (date: string, dsex: number, calls: ReturnType<typeof call>[]): DaySnapshot => ({ date, dsex, calls });

test('research is right when the stock beats DSEX; avoid and caution when it lags', () => {
  assert.equal(isRight('research', 2), true);
  assert.equal(isRight('research', -0.1), false);
  assert.equal(isRight('avoid', -3), true);
  assert.equal(isRight('caution', 1), false);
  assert.equal(isRight('research', 0), false);
});

test('one-day grades use the next snapshot: excess = stock return minus DSEX return, in points', () => {
  const snaps = [
    day('2026-11-16', 1000, [call('AAA', 'research', 100), call('BBB', 'avoid', 50), call('CCC', 'neutral', 10)]),
    day('2026-11-17', 1010, [call('AAA', 'research', 103), call('BBB', 'avoid', 52), call('CCC', 'neutral', 11)]),
  ];
  const { grades, pending } = gradeAll(snaps);
  const aaa = grades.find((g) => g.code === 'AAA' && g.horizon === 1);
  const bbb = grades.find((g) => g.code === 'BBB' && g.horizon === 1);
  assert.ok(aaa && bbb);
  assert.ok(Math.abs(aaa.excess - 2) < 1e-9); // +3% vs +1%
  assert.equal(aaa.right, true);
  assert.ok(Math.abs(bbb.excess - 3) < 1e-9); // +4% vs +1%: avoid was wrong
  assert.equal(bbb.right, false);
  assert.equal(grades.some((g) => g.code === 'CCC'), false, 'neutral is never graded');
  // Day 1: AAA,BBB wait for 5 and 20; day 2: AAA,BBB wait for 1, 5, 20 → 2*2 + 2*3.
  assert.equal(pending, 10);
});

test('a missing later price falls back to the stored series, and is skipped (never NaN) when absent there too', () => {
  const snaps = [
    day('2026-11-16', 1000, [call('AAA', 'research', 100), call('BBB', 'caution', 20)]),
    day('2026-11-17', 1000, []),
  ];
  const { grades } = gradeAll(snaps, { AAA: [{ date: '2026-11-17', price: 95 }] });
  assert.equal(grades.length, 1);
  assert.equal(grades[0].code, 'AAA');
  assert.ok(Math.abs(grades[0].excess + 5) < 1e-9);
  assert.ok(grades.every((g) => Number.isFinite(g.excess)));
});

test('5-day horizon counts recorded sessions, and the report aggregates by signal and horizon', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08'];
  // DSEX flat at 1000; AAA (research) rises 1 taka a day; BBB (avoid) falls 1 a day.
  const snaps = dates.map((d, i) => day(d, 1000, [call('AAA', 'research', 100 + i), call('BBB', 'avoid', 100 - i)]));
  const r = scorecard(snaps);
  assert.equal(r.since, '2026-11-01');
  assert.equal(r.days, 6);
  const r5 = r.bySignal.research[5];
  assert.equal(r5.n, 1);
  assert.equal(r5.pctRight, 100);
  assert.ok(Math.abs((r5.avgExcess as number) - 5) < 1e-9); // 100 → 105 over 5 sessions
  assert.equal(r.bySignal.avoid[1].n, 5);
  assert.equal(r.bySignal.avoid[1].pctRight, 100);
  assert.equal(r.bySignal.caution[1].n, 0);
  assert.equal(r.bySignal.caution[1].pctRight, null);
  assert.equal(r.best[0].code, 'AAA');
  assert.equal(r.best[0].horizon, 5, 'best uses the longest graded horizon');
  assert.equal(r.worst.length, 0, 'no call went against us');
});

test('weakest group is the lowest share right; null before any grade', () => {
  assert.equal(weakestGroup(scorecard([]).bySignal), null);
  const snaps = [
    day('2026-11-16', 1000, [call('AAA', 'research', 100), call('BBB', 'avoid', 100)]),
    day('2026-11-17', 1000, [call('AAA', 'research', 99), call('BBB', 'avoid', 98)]),
  ];
  const r = scorecard(snaps);
  const w = weakestGroup(r.bySignal);
  assert.equal(w?.signal, 'research');
  assert.equal(w?.group.pctRight, 0);
  assert.equal(r.worst[0].code, 'AAA');
});

test('snapshot validation rejects bad headers and drops bad calls', () => {
  assert.equal(validSnapshot(null), null);
  assert.equal(validSnapshot({ date: '20-11-2026', dsex: 5500, calls: [] }), null);
  assert.equal(validSnapshot({ date: '2026-11-19', dsex: 0, calls: [] }), null);
  const s = validSnapshot({ date: '2026-11-19', dsex: 5505.6, calls: [call('GP', 'research', 300), call('bad code', 'research', 1), call('X', 'maybe', 1), call('Y', 'avoid', 0)] });
  assert.deepEqual(s?.calls.map((c) => c.code), ['GP']);
});

test('snapshot is due Sunday to Thursday from 14:45 Dhaka time', () => {
  const at = (iso: string) => Date.parse(iso); // UTC; Dhaka = UTC+6
  assert.equal(snapshotDue(at('2026-11-19T08:44:00Z')), false); // Thu 14:44
  assert.equal(snapshotDue(at('2026-11-19T08:45:00Z')), true); // Thu 14:45
  assert.equal(snapshotDue(at('2026-11-20T10:00:00Z')), false); // Fri
  assert.equal(snapshotDue(at('2026-11-21T10:00:00Z')), false); // Sat
  assert.equal(snapshotDue(at('2026-11-22T09:00:00Z')), true); // Sun 15:00
});
