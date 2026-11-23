import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrefs, prefsFromRows, prefsToRows } from '../lib/prefs.ts';

const rangeRule = { id: 'rr1', kind: 'nearLow' as const, pct: 5, scope: 'all' as const };

test('prefs round-trip through Sheet rows', () => {
  const p = { watchlist: ['GP', 'WALTONHIL'], brokerCommissionPct: '0.4', alertRules: [{ type: 'price_above' as const, id: 'r1', enabled: true, code: 'GP', target: 250 }], rangeRules: [rangeRule] };
  assert.deepEqual(prefsFromRows(prefsToRows(p)), p);
});

test('prefsFromRows skips unknown keys, bad codes and bad rates', () => {
  assert.deepEqual(prefsFromRows([['watchlist', '["gp","bad code!","GP"]'], ['brokerCommissionPct', '9'], ['other', 'x']]), { watchlist: ['GP'] });
  assert.deepEqual(prefsFromRows([['watchlist', 'not json']]), {});
});

test('prefsFromRows reads rangeRules and drops malformed ones', () => {
  assert.deepEqual(prefsFromRows([['rangeRules', JSON.stringify([rangeRule, { id: 'bad', kind: 'bogus', pct: 5, scope: 'all' }])]]), { rangeRules: [rangeRule] });
  assert.deepEqual(prefsFromRows([['rangeRules', 'not json']]), {});
  assert.deepEqual(prefsFromRows([['rangeRules', '{}']]), {});
});

test('parsePrefs refuses wrong shapes and out-of-range rates; empty rate means none', () => {
  assert.equal(parsePrefs(null), null);
  assert.equal(parsePrefs([]), null);
  assert.equal(parsePrefs({ watchlist: 'GP' }), null);
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '6', alertRules: [], rangeRules: [] }), null);
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '0.4' }), null);
  assert.equal(parsePrefs({}), null);
  assert.equal(parsePrefs({ watchlist: ['GP'] }), null);
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: 0.4, alertRules: [], rangeRules: [] }), null);
  // An older page sends no rangeRules: accepted without the field, so savePrefs keeps the saved rules.
  assert.deepEqual(parsePrefs({ watchlist: [], brokerCommissionPct: '0.4', alertRules: [] }), { watchlist: [], brokerCommissionPct: '0.4', alertRules: [] });
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '0.4', alertRules: [], rangeRules: 'x' }), null, 'rangeRules present but not a list');
  assert.deepEqual(parsePrefs({ watchlist: ['gp'], brokerCommissionPct: ' ', alertRules: [{ type: 'bogus' }], rangeRules: [] }), { watchlist: ['GP'], brokerCommissionPct: '', alertRules: [], rangeRules: [] });
});

test('parsePrefs parses rangeRules and drops malformed ones', () => {
  const result = parsePrefs({ watchlist: [], brokerCommissionPct: '0.4', alertRules: [], rangeRules: [rangeRule, { id: 'bad' }] });
  assert.deepEqual(result?.rangeRules, [rangeRule]);
});

test('alert rules are capped and damaged rules dropped', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ type: 'price_below', id: `r${i}`, enabled: true, code: 'GP', target: 200 }));
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '0.4', alertRules: many, rangeRules: [] })?.alertRules?.length, 100);
  assert.deepEqual(prefsFromRows([['alertRules', 'oops']]), {});
});

test('a range rule with a valid pick round-trips; an unknown pick is dropped from the field but the rule is kept', () => {
  const withPick = { id: 'rr2', kind: 'nearLow' as const, pct: 5, scope: 'all' as const, pick: 'good' as const };
  assert.deepEqual(prefsFromRows(prefsToRows({ watchlist: [], brokerCommissionPct: '0.4', alertRules: [], rangeRules: [withPick] }))?.rangeRules, [withPick]);

  const withBogus = { id: 'rr3', kind: 'nearLow' as const, pct: 5, scope: 'all' as const, pick: 'bogus' as never };
  assert.deepEqual(prefsFromRows(prefsToRows({ watchlist: [], brokerCommissionPct: '0.4', alertRules: [], rangeRules: [withBogus] }))?.rangeRules, [{ id: 'rr3', kind: 'nearLow', pct: 5, scope: 'all' }]);
});
