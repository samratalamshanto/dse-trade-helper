import test from 'node:test';
import assert from 'node:assert';
import { cached, seen, remember, FAILURE_TTL_MS } from '../lib/dse.ts';
import { shouldAutoRefresh, refreshDue, SLOW_REFRESH_MS } from '../components/format.ts';
import type { MarketSession } from '../lib/dse.ts';

test('concurrent misses share one load', async () => {
  let calls = 0;
  const load = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return calls; };
  const [a, b, c] = await Promise.all([cached('t1', 1000, load), cached('t1', 1000, load), cached('t1', 1000, load)]);
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual([a, b, c], [1, 1, 1]);
  assert.strictEqual(await cached('t1', 1000, load), 1);
});

test('a rejected load with no good value is remembered for 10 s, then retried', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 2_000_000 });
  let calls = 0;
  const load = async () => { calls++; if (calls === 1) throw new Error('down'); return 'ok'; };
  await assert.rejects(Promise.all([cached('t2', 1000, load), cached('t2', 1000, load)]), /down/);
  await assert.rejects(cached('t2', 1000, load), /down/);
  assert.strictEqual(calls, 1);
  t.mock.timers.tick(FAILURE_TTL_MS);
  assert.strictEqual(await cached('t2', 1000, load), 'ok');
  assert.strictEqual(calls, 2);
});

test('A3: a failed refresh serves the last good value and does not refetch for 10 s', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 3_000_000 });
  t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const load = async () => { calls++; if (calls > 1) throw new Error('DSE down'); return 'good'; };
  assert.strictEqual(await cached('t4', 30_000, load), 'good');
  t.mock.timers.tick(30_000);
  assert.strictEqual(await cached('t4', 30_000, load), 'good');
  assert.strictEqual(await cached('t4', 30_000, load), 'good');
  assert.strictEqual(calls, 2);
  t.mock.timers.tick(FAILURE_TTL_MS);
  assert.strictEqual(await cached('t4', 30_000, load), 'good');
  assert.strictEqual(calls, 3);
});

test('stale-while-revalidate: a slow refresh does not block when a recent last-good value exists', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 4_000_000 });
  let calls = 0;
  let finish: (v: string) => void = () => {};
  const load = () => { calls++; return calls === 1 ? Promise.resolve('old') : new Promise<string>((r) => { finish = r; }); };
  assert.strictEqual(await cached('t5', 30_000, load, 600_000), 'old');
  t.mock.timers.tick(30_000);
  assert.strictEqual(await cached('t5', 30_000, load, 600_000), 'old');
  assert.strictEqual(await cached('t5', 30_000, load, 600_000), 'old');
  assert.strictEqual(calls, 2);
  finish('new');
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(await cached('t5', 30_000, load, 600_000), 'new');
  assert.strictEqual(calls, 2);
});

test('stale-while-revalidate: a last-good value older than the max age waits for the load', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
  let calls = 0;
  const load = async () => (++calls === 1 ? 'old' : 'fresh');
  await cached('t6', 30_000, load, 600_000);
  t.mock.timers.tick(600_000);
  assert.strictEqual(await cached('t6', 30_000, load, 600_000), 'fresh');
});

test('an expired entry loads again', async () => {
  let calls = 0;
  const load = async () => ++calls;
  await cached('t3', 0, load);
  await cached('t3', 0, load);
  assert.strictEqual(calls, 2);
});

test('seen is true only within the window after remember', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  assert.strictEqual(seen('missing:XYZ', 600_000), false);
  remember('missing:XYZ');
  assert.strictEqual(seen('missing:XYZ', 600_000), true);
  t.mock.timers.tick(599_999);
  assert.strictEqual(seen('missing:XYZ', 600_000), true);
  t.mock.timers.tick(1);
  assert.strictEqual(seen('missing:XYZ', 600_000), false);
  assert.strictEqual(seen('missing:OTHER', 600_000), false);
});

const session = (over: Partial<MarketSession>): MarketSession => ({
  isOpen: false, phase: null, tradingDay: true, sessionDate: null, opening: '10:00', today: null, next: null, dataTime: null, ...over,
});
const atDhaka = (t: { mock: { timers: { enable: (o: { apis: 'Date'[]; now: number }) => void } } }, hhmm: string) =>
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(`2026-11-19T${hhmm}:00Z`) - 6 * 3_600_000 });

test('auto refresh runs while open', (t) => {
  atDhaka(t, '11:00');
  assert.strictEqual(shouldAutoRefresh(session({ isOpen: true })), true);
});

test('auto refresh runs in the 15 minutes before the open on a trading day', (t) => {
  atDhaka(t, '09:50');
  assert.strictEqual(shouldAutoRefresh(session({})), true);
});

test('auto refresh keeps running just after the opening time until the open session is seen', (t) => {
  atDhaka(t, '10:05');
  assert.strictEqual(shouldAutoRefresh(session({})), true);
});

test('no auto refresh after close, on a holiday, or with no session', (t) => {
  atDhaka(t, '15:00');
  assert.strictEqual(shouldAutoRefresh(session({})), false);
  t.mock.timers.setTime(Date.parse('2026-11-19T03:30:00Z'));
  assert.strictEqual(shouldAutoRefresh(session({ tradingDay: false })), false);
  assert.strictEqual(shouldAutoRefresh(null), false);
});

test('no fast refresh in the middle of the night before a trading day', (t) => {
  atDhaka(t, '02:00');
  assert.strictEqual(shouldAutoRefresh(session({})), false);
});

test('a closed market still refreshes slowly so a tab left open sees the next session', (t) => {
  atDhaka(t, '15:00');
  const now = Date.now();
  assert.strictEqual(refreshDue(session({}), now - 60_000, now), false);
  assert.strictEqual(refreshDue(session({}), now - SLOW_REFRESH_MS, now), true);
  assert.strictEqual(refreshDue(session({ isOpen: true }), now - 60_000, now), true);
});
