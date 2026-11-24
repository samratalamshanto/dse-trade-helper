import test from 'node:test';
import assert from 'node:assert';
import { lastDataLabel, monthYearShort } from '../components/format.ts';

test('lastDataLabel: today shows only the time; another day adds the weekday', () => {
  assert.strictEqual(lastDataLabel('Nov 24, 2026 at 2:42 PM', null, '2026-11-24', 'en'), '2:42 PM');
  assert.strictEqual(lastDataLabel('Nov 23, 2026 at 2:42 PM', null, '2026-11-24', 'en'), 'Mon 23 Nov, 2:42 PM');
  assert.strictEqual(lastDataLabel(null, '2026-11-23', '2026-11-24', 'en'), 'Mon 23 Nov');
  assert.strictEqual(lastDataLabel(null, null, '2026-11-24', 'en'), '');
  assert.match(lastDataLabel('Nov 23, 2026 at 2:42 PM', null, '2026-11-24', 'bn'), /^সোম/);
});

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
