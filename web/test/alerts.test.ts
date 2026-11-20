import test from 'node:test';
import assert from 'node:assert';
import {
  parseAlertStore, encodeAlertStore, dhakaDate, evaluateRules, applyFiredResult, newRuleId, rulesForSession,
  type AlertStore, type AlertRule, type CompanySnap, type DivSnap,
} from '../lib/alerts.ts';

// --- parseAlertStore ---

test('empty / missing raw returns empty store', () => {
  for (const raw of [null, '', undefined, '{}']) {
    const s = parseAlertStore(raw);
    assert.deepStrictEqual(s, { rules: [], fired: {}, history: [] }, String(raw));
  }
});

test('damaged JSON returns empty store', () => {
  for (const raw of ['not json', '{bad', '42', '[]', '"string"']) {
    const s = parseAlertStore(raw);
    assert.deepStrictEqual(s, { rules: [], fired: {}, history: [] }, raw);
  }
});

test('bad rules are dropped: bad code, bad target, unknown type', () => {
  const raw = JSON.stringify({ rules: [
    { type: 'price_above', id: 'a', code: 'BAD CODE!', target: 10 },
    { type: 'price_above', id: 'b', code: 'GP', target: -5 },
    { type: 'big_move', id: 'c', code: 'GP', threshold: 0 },
    { type: 'unknown_type', id: 'd', code: 'GP' },
    { type: 'price_above', id: '', code: 'GP', target: 10 },
  ] });
  const s = parseAlertStore(raw);
  assert.strictEqual(s.rules.length, 0);
});

test('valid rules of all types parse correctly', () => {
  const raw = JSON.stringify({ rules: [
    { type: 'price_above', id: 'r1', enabled: true, code: 'gp', target: 50 },
    { type: 'price_below', id: 'r2', enabled: false, code: 'GP', target: 30.5 },
    { type: 'dividend', id: 'r3', enabled: true, code: 'GP', daysBefore: 5 },
    { type: 'fraud_flag', id: 'r4', enabled: true, code: 'GP', seenFlags: ['Cat Z'] },
    { type: 'big_move', id: 'r5', enabled: true, code: 'GP', threshold: 7.5 },
  ] });
  const s = parseAlertStore(raw);
  assert.strictEqual(s.rules.length, 5);
  assert.strictEqual((s.rules[0] as Extract<AlertRule, { type: 'price_above' }>).code, 'GP');
  assert.strictEqual(s.rules[1].enabled, false);
  assert.strictEqual((s.rules[2] as Extract<AlertRule, { type: 'dividend' }>).daysBefore, 5);
  assert.deepStrictEqual((s.rules[3] as Extract<AlertRule, { type: 'fraud_flag' }>).seenFlags, ['Cat Z']);
  assert.strictEqual((s.rules[4] as Extract<AlertRule, { type: 'big_move' }>).threshold, 7.5);
});

test('dividend rule uses default daysBefore=3 for invalid or missing values', () => {
  const raw = JSON.stringify({ rules: [
    { type: 'dividend', id: 'x', enabled: true, code: 'GP', daysBefore: -1 },
    { type: 'dividend', id: 'y', enabled: true, code: 'GP' },
    { type: 'dividend', id: 'z', enabled: true, code: 'GP', daysBefore: 100 },
  ] });
  const s = parseAlertStore(raw);
  assert.ok(s.rules.every((r) => (r as Extract<AlertRule, { type: 'dividend' }>).daysBefore === 3));
});

test('fired and history entries are preserved', () => {
  const store: AlertStore = {
    rules: [],
    fired: { 'r1:2026-11-19': '2026-11-19' },
    history: [{ ruleId: 'r1', code: 'GP', message: 'test', key: 'r1:2026-11-19', date: '2026-11-19' }],
  };
  const s = parseAlertStore(encodeAlertStore(store));
  assert.deepStrictEqual(s.fired, store.fired);
  assert.deepStrictEqual(s.history, store.history);
});

test('bad history items are dropped', () => {
  const raw = JSON.stringify({ history: [
    { ruleId: 'r1', code: 'GP', message: 'ok', key: 'k', date: '2026-11-19' },
    { ruleId: 'r1', code: 'GP', message: 'missing date', key: 'k' },
    42,
    null,
  ] });
  const s = parseAlertStore(raw);
  assert.strictEqual(s.history.length, 1);
});

// --- dhakaDate ---

test('dhakaDate returns YYYY-MM-DD in Dhaka time (UTC+6)', () => {
  // 2026-11-19T17:59:00Z → 2026-11-19T23:59:00+06:00 → still 2026-11-19
  assert.strictEqual(dhakaDate(new Date('2026-11-19T17:59:00Z').getTime()), '2026-11-19');
  // 2026-11-19T18:00:00Z → 2026-11-20T00:00:00+06:00 → 2026-11-20
  assert.strictEqual(dhakaDate(new Date('2026-11-19T18:00:00Z').getTime()), '2026-11-20');
});

// --- evaluateRules ---

const TODAY = '2026-11-19';

test('price_above: fires at or above target, not below', () => {
  const rule: AlertRule = { type: 'price_above', id: 'r1', enabled: true, code: 'GP', target: 50 };
  const co: CompanySnap = { code: 'GP', price: 49.99, changePct: 0, flags: [] };
  assert.strictEqual(evaluateRules([rule], [co], [], TODAY, {}).events.length, 0);
  assert.strictEqual(evaluateRules([rule], [{ ...co, price: 50 }], [], TODAY, {}).events.length, 1);
  assert.strictEqual(evaluateRules([rule], [{ ...co, price: 55 }], [], TODAY, {}).events.length, 1);
});

test('price_below: fires at or below target, not above', () => {
  const rule: AlertRule = { type: 'price_below', id: 'r1', enabled: true, code: 'GP', target: 30 };
  const co: CompanySnap = { code: 'GP', price: 30.01, changePct: 0, flags: [] };
  assert.strictEqual(evaluateRules([rule], [co], [], TODAY, {}).events.length, 0);
  assert.strictEqual(evaluateRules([rule], [{ ...co, price: 30 }], [], TODAY, {}).events.length, 1);
  assert.strictEqual(evaluateRules([rule], [{ ...co, price: 25 }], [], TODAY, {}).events.length, 1);
});

test('dividend: fires within daysBefore window, not before', () => {
  const rule: AlertRule = { type: 'dividend', id: 'r1', enabled: true, code: 'GP', daysBefore: 3 };
  const mk = (lastBuyDate: string): DivSnap => ({ code: 'GP', lastBuyDate });
  assert.strictEqual(evaluateRules([rule], [], [mk('2026-11-23')], TODAY, {}).events.length, 0, 'too far');
  assert.strictEqual(evaluateRules([rule], [], [mk('2026-11-22')], TODAY, {}).events.length, 1, '3 days');
  assert.strictEqual(evaluateRules([rule], [], [mk('2026-11-20')], TODAY, {}).events.length, 1, '1 day');
  assert.strictEqual(evaluateRules([rule], [], [mk('2026-11-19')], TODAY, {}).events.length, 1, 'today');
  assert.strictEqual(evaluateRules([rule], [], [mk('2026-11-18')], TODAY, {}).events.length, 0, 'past');
});

test('dividend: message says "today" / "tomorrow" / "in N days"', () => {
  const rule: AlertRule = { type: 'dividend', id: 'r1', enabled: true, code: 'GP', daysBefore: 5 };
  const r0 = evaluateRules([rule], [], [{ code: 'GP', lastBuyDate: '2026-11-19' }], TODAY, {});
  const r1 = evaluateRules([rule], [], [{ code: 'GP', lastBuyDate: '2026-11-20' }], TODAY, {});
  const r3 = evaluateRules([rule], [], [{ code: 'GP', lastBuyDate: '2026-11-22' }], TODAY, {});
  assert.ok(r0.events[0].message.includes('today'));
  assert.ok(r1.events[0].message.includes('tomorrow'));
  assert.ok(r3.events[0].message.includes('in 3 days'));
});

test('fraud_flag: fires only for new flags, returns seenFlagsUpdate', () => {
  const rule: AlertRule = { type: 'fraud_flag', id: 'r1', enabled: true, code: 'GP', seenFlags: ['Cat Z'] };
  const co: CompanySnap = { code: 'GP', price: 20, changePct: 0, flags: ['Cat Z'] };
  assert.strictEqual(evaluateRules([rule], [co], [], TODAY, {}).events.length, 0, 'no new flags');
  const withNew: CompanySnap = { ...co, flags: ['Cat Z', 'New flag'] };
  const r = evaluateRules([rule], [withNew], [], TODAY, {});
  assert.strictEqual(r.events.length, 1);
  assert.ok(r.events[0].message.includes('New flag'));
  assert.deepStrictEqual(r.seenFlagsUpdates[0].seenFlags, ['Cat Z', 'New flag']);
});

test('fraud_flag: fires when code had no flags and now has one', () => {
  const rule: AlertRule = { type: 'fraud_flag', id: 'r1', enabled: true, code: 'GP', seenFlags: [] };
  const r = evaluateRules([rule], [{ code: 'GP', price: 20, changePct: 0, flags: ['Cat Z'] }], [], TODAY, {});
  assert.strictEqual(r.events.length, 1);
});

test('big_move: fires at or above threshold (positive and negative)', () => {
  const rule: AlertRule = { type: 'big_move', id: 'r1', enabled: true, code: 'GP', threshold: 5 };
  const mk = (pct: number): CompanySnap => ({ code: 'GP', price: 20, changePct: pct, flags: [] });
  assert.strictEqual(evaluateRules([rule], [mk(4.9)], [], TODAY, {}).events.length, 0);
  assert.strictEqual(evaluateRules([rule], [mk(5)], [], TODAY, {}).events.length, 1);
  assert.strictEqual(evaluateRules([rule], [mk(-5)], [], TODAY, {}).events.length, 1);
  assert.ok(evaluateRules([rule], [mk(-7)], [], TODAY, {}).events[0].message.includes('down'));
  assert.ok(evaluateRules([rule], [mk(7)], [], TODAY, {}).events[0].message.includes('up'));
});

test('disabled rule never fires', () => {
  const rule: AlertRule = { type: 'price_above', id: 'r1', enabled: false, code: 'GP', target: 10 };
  const r = evaluateRules([rule], [{ code: 'GP', price: 100, changePct: 0, flags: [] }], [], TODAY, {});
  assert.strictEqual(r.events.length, 0);
});

test('missing code never fires', () => {
  const rule: AlertRule = { type: 'price_above', id: 'r1', enabled: true, code: 'XYZ', target: 10 };
  const r = evaluateRules([rule], [{ code: 'GP', price: 100, changePct: 0, flags: [] }], [], TODAY, {});
  assert.strictEqual(r.events.length, 0);
});

test('null price or changePct does not fire price/big_move rules', () => {
  const co: CompanySnap = { code: 'GP', price: null, changePct: null, flags: [] };
  const pa: AlertRule = { type: 'price_above', id: 'r1', enabled: true, code: 'GP', target: 1 };
  const bm: AlertRule = { type: 'big_move', id: 'r2', enabled: true, code: 'GP', threshold: 1 };
  assert.strictEqual(evaluateRules([pa, bm], [co], [], TODAY, {}).events.length, 0);
});

// --- de-duplication ---

test('same rule does not fire twice on the same day', () => {
  const rule: AlertRule = { type: 'price_above', id: 'r1', enabled: true, code: 'GP', target: 10 };
  const co: CompanySnap = { code: 'GP', price: 20, changePct: 0, flags: [] };
  const firedToday = { [`r1:${TODAY}`]: TODAY };
  const r = evaluateRules([rule], [co], [], TODAY, firedToday);
  assert.strictEqual(r.events.length, 0);
});

test('day rollover: fires again on a new day', () => {
  const rule: AlertRule = { type: 'price_above', id: 'r1', enabled: true, code: 'GP', target: 10 };
  const co: CompanySnap = { code: 'GP', price: 20, changePct: 0, flags: [] };
  const yesterday = '2026-11-18';
  const firedYesterday = { [`r1:${yesterday}`]: yesterday };
  const r = evaluateRules([rule], [co], [], TODAY, firedYesterday);
  assert.strictEqual(r.events.length, 1);
});

// --- applyFiredResult ---

test('applyFiredResult marks events fired and grows history', () => {
  const rule: AlertRule = { type: 'price_above', id: 'r1', enabled: true, code: 'GP', target: 10 };
  const store: AlertStore = { rules: [rule], fired: {}, history: [] };
  const result = evaluateRules([rule], [{ code: 'GP', price: 20, changePct: 0, flags: [] }], [], TODAY, {});
  const next = applyFiredResult(store, result, TODAY);
  assert.strictEqual(next.fired[`r1:${TODAY}`], TODAY);
  assert.strictEqual(next.history.length, 1);
});

test('applyFiredResult updates seenFlags for fraud_flag rule', () => {
  const rule: AlertRule = { type: 'fraud_flag', id: 'r1', enabled: true, code: 'GP', seenFlags: [] };
  const store: AlertStore = { rules: [rule], fired: {}, history: [] };
  const co: CompanySnap = { code: 'GP', price: 20, changePct: 0, flags: ['Cat Z'] };
  const result = evaluateRules([rule], [co], [], TODAY, {});
  const next = applyFiredResult(store, result, TODAY);
  const updated = next.rules[0] as Extract<AlertRule, { type: 'fraud_flag' }>;
  assert.deepStrictEqual(updated.seenFlags, ['Cat Z']);
});

test('applyFiredResult with no events returns store unchanged', () => {
  const store: AlertStore = { rules: [], fired: { k: 'v' }, history: [] };
  const next = applyFiredResult(store, { events: [], seenFlagsUpdates: [] }, TODAY);
  assert.strictEqual(next, store);
});

test('newRuleId returns distinct IDs', () => {
  const ids = new Set(Array.from({ length: 20 }, () => newRuleId()));
  assert.strictEqual(ids.size, 20);
});

test('dividend: message includes "(estimated)" when lastBuyEstimated is true', () => {
  const rule: AlertRule = { type: 'dividend', id: 'r1', enabled: true, code: 'GP', daysBefore: 5 };
  const withEst = evaluateRules([rule], [], [{ code: 'GP', lastBuyDate: TODAY, lastBuyEstimated: true }], TODAY, {});
  assert.ok(withEst.events[0].message.includes('estimated'), 'should include "estimated"');
  const withoutEst = evaluateRules([rule], [], [{ code: 'GP', lastBuyDate: TODAY, lastBuyEstimated: false }], TODAY, {});
  assert.ok(!withoutEst.events[0].message.includes('estimated'), 'should not include "estimated" when false');
  const noFlag = evaluateRules([rule], [], [{ code: 'GP', lastBuyDate: TODAY }], TODAY, {});
  assert.ok(!noFlag.events[0].message.includes('estimated'), 'should not include "estimated" when flag absent');
});

test('rulesForSession: price and move rules only run when the session is today', () => {
  const rules: AlertRule[] = [
    { type: 'price_above', id: 'a', enabled: true, code: 'GP', target: 200 },
    { type: 'price_below', id: 'b', enabled: true, code: 'GP', target: 300 },
    { type: 'big_move', id: 'c', enabled: true, code: 'GP', threshold: 1 },
    { type: 'dividend', id: 'd', enabled: true, code: 'GP', daysBefore: 3 },
    { type: 'fraud_flag', id: 'e', enabled: true, code: 'GP', seenFlags: [] },
  ];
  assert.deepStrictEqual(rulesForSession(rules, '2026-11-20', '2026-11-20').map((r) => r.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepStrictEqual(rulesForSession(rules, '2026-11-19', '2026-11-20').map((r) => r.id), ['d', 'e']);
  assert.deepStrictEqual(rulesForSession(rules, null, '2026-11-20').map((r) => r.id), ['d', 'e']);
});
