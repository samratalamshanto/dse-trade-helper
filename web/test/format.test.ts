import test from 'node:test';
import assert from 'node:assert';
import { monthYearShort } from '../components/format.ts';

test('monthYearShort: valid YYYY-MM returns short month and year', () => {
  assert.strictEqual(monthYearShort('2027-02'), 'Feb 2027');
  assert.strictEqual(monthYearShort('2026-01'), 'Jan 2026');
  assert.strictEqual(monthYearShort('2025-12'), 'Dec 2025');
});

test('monthYearShort: empty string returns empty string', () => {
  assert.strictEqual(monthYearShort(''), '');
});

test('monthYearShort: invalid month returns empty string', () => {
  assert.strictEqual(monthYearShort('2027-13'), '');
});

test('monthYearShort: null and undefined return empty string', () => {
  assert.strictEqual(monthYearShort(null), '');
  assert.strictEqual(monthYearShort(undefined), '');
});
