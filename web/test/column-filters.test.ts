import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnFilterTest, divState, formatConditions, parseConditions, parseDivStates, passesCondition, type FilterRow } from '../lib/column-filters.ts';

type Row = FilterRow & { code: string };
const row = (over: Partial<Row>): Row => ({ code: 'X', price: 15, position: 0.5, aboveLowPct: 52.34, score: 60, recordDate: null, ...over });
const TODAY = '2026-11-25';

test('the address round-trips, and unknown fields, operators and states are dropped', () => {
  const list = parseConditions('score:gt:50,pos:lt:20,pe:gt:1,above:xx:3,rec:eq:2026-12-01,price:lt:');
  assert.deepEqual(list, [
    { field: 'score', op: 'gt', value: '50' }, { field: 'pos', op: 'lt', value: '20' },
    { field: 'rec', op: 'eq', value: '2026-12-01' }, { field: 'price', op: 'lt', value: '' },
  ]);
  assert.equal(formatConditions(list), 'score:gt:50,pos:lt:20,rec:eq:2026-12-01,price:lt:');
  assert.equal(formatConditions([{ field: 'price', op: 'gt', value: '1,5:0' }]), 'price:gt:150');
  assert.deepEqual(parseDivStates('up,junk,none'), ['up', 'none']);
  assert.deepEqual(parseConditions(null), []);
});

test('> < = compare the value the table shows', () => {
  const r = row({});
  assert.ok(passesCondition(r, { field: 'score', op: 'gt', value: '50' }));
  assert.ok(!passesCondition(r, { field: 'score', op: 'gt', value: '60' }));
  assert.ok(passesCondition(r, { field: 'score', op: 'eq', value: '60' }));
  assert.ok(passesCondition(r, { field: 'price', op: 'lt', value: '15.5' }));
  assert.ok(passesCondition(r, { field: 'pos', op: 'eq', value: '50' }));
  assert.ok(passesCondition(row({ position: 0.099 }), { field: 'pos', op: 'eq', value: '9' }));
  assert.ok(passesCondition(r, { field: 'above', op: 'eq', value: '52.3' }));
  assert.ok(passesCondition(row({ aboveLowPct: -2 }), { field: 'above', op: 'lt', value: '0' }));
});

test('a row with no value fails; a half-typed value filters nothing', () => {
  assert.ok(!passesCondition(row({ score: null }), { field: 'score', op: 'gt', value: '0' }));
  assert.ok(!passesCondition(row({ position: null }), { field: 'pos', op: 'lt', value: '20' }));
  assert.ok(passesCondition(row({ score: null }), { field: 'score', op: 'gt', value: '' }));
  assert.ok(passesCondition(row({}), { field: 'price', op: 'lt', value: '-' }));
  assert.ok(passesCondition(row({}), { field: 'rec', op: 'gt', value: '2026-1' }));
});

test('record date: label against today, and date comparisons', () => {
  assert.equal(divState(null, TODAY), 'none');
  assert.equal(divState('2026-11-25', TODAY), 'up');
  assert.equal(divState('2026-11-24', TODAY), 'past');
  const r = row({ recordDate: '2026-12-10' });
  assert.ok(passesCondition(r, { field: 'rec', op: 'gt', value: '2026-12-01' }));
  assert.ok(passesCondition(r, { field: 'rec', op: 'eq', value: '2026-12-10' }));
  assert.ok(!passesCondition(row({}), { field: 'rec', op: 'lt', value: '2030-01-01' }));
});

test('everything combines: two conditions on one column, ticked labels are either-or', () => {
  const rows = [row({ code: 'A', price: 8 }), row({ code: 'B', price: 15, recordDate: '2026-12-10' }), row({ code: 'C', price: 25, recordDate: '2026-01-01' })];
  const between = columnFilterTest([{ field: 'price', op: 'gt', value: '5' }, { field: 'price', op: 'lt', value: '20' }], [], TODAY);
  assert.deepEqual(rows.filter(between).map((r) => r.code), ['A', 'B']);
  assert.deepEqual(rows.filter(columnFilterTest([], ['up', 'none'], TODAY)).map((r) => r.code), ['A', 'B']);
  assert.deepEqual(rows.filter(columnFilterTest([{ field: 'price', op: 'gt', value: '5' }], ['past'], TODAY)).map((r) => r.code), ['C']);
});
