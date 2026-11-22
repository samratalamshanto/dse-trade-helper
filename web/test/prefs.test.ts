import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrefs, prefsFromRows, prefsToRows } from '../lib/prefs.ts';

test('prefs round-trip through Sheet rows', () => {
  const p = { watchlist: ['GP', 'WALTONHIL'], brokerCommissionPct: '0.4', alertRules: [{ type: 'price_above' as const, id: 'r1', enabled: true, code: 'GP', target: 250 }] };
  assert.deepEqual(prefsFromRows(prefsToRows(p)), p);
});

test('prefsFromRows skips unknown keys, bad codes and bad rates', () => {
  assert.deepEqual(prefsFromRows([['watchlist', '["gp","bad code!","GP"]'], ['brokerCommissionPct', '9'], ['other', 'x']]), { watchlist: ['GP'] });
  assert.deepEqual(prefsFromRows([['watchlist', 'not json']]), {});
});

test('parsePrefs refuses wrong shapes and out-of-range rates; empty rate means none', () => {
  assert.equal(parsePrefs(null), null);
  assert.equal(parsePrefs([]), null);
  assert.equal(parsePrefs({ watchlist: 'GP' }), null);
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '6', alertRules: [] }), null);
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '0.4' }), null);
  assert.equal(parsePrefs({}), null);
  assert.equal(parsePrefs({ watchlist: ['GP'] }), null);
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: 0.4, alertRules: [] }), null);
  assert.deepEqual(parsePrefs({ watchlist: ['gp'], brokerCommissionPct: ' ', alertRules: [{ type: 'bogus' }] }), { watchlist: ['GP'], brokerCommissionPct: '', alertRules: [] });
});

test('alert rules are capped and damaged rules dropped', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ type: 'price_below', id: `r${i}`, enabled: true, code: 'GP', target: 200 }));
  assert.equal(parsePrefs({ watchlist: [], brokerCommissionPct: '0.4', alertRules: many })?.alertRules?.length, 100);
  assert.deepEqual(prefsFromRows([['alertRules', 'oops']]), {});
});
