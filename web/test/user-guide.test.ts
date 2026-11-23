import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowGuide } from '../lib/guide.ts';

test('shows guide when nothing is stored (first visit)', () => {
  assert.equal(shouldShowGuide(null), true);
});

test('shows guide when stored value is "0" (default fallback)', () => {
  assert.equal(shouldShowGuide('0'), true);
});

test('shows guide when stored value is any non-"1" string', () => {
  assert.equal(shouldShowGuide(''), true);
  assert.equal(shouldShowGuide('false'), true);
  assert.equal(shouldShowGuide('dismissed'), true);
});

test('hides guide once dismissed (stored value is "1")', () => {
  assert.equal(shouldShowGuide('1'), false);
});
