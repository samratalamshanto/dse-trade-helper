import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagCountText } from '../lib/glossary.ts';
import { BN } from '../components/i18n-bn.ts';

test('the warning pill counts the real flags: two price flags never read "1 flag pattern"', () => {
  assert.equal(flagCountText(0), 'No flags');
  assert.equal(flagCountText(1), '1 flag pattern');
  assert.equal(flagCountText(2).replace('{n}', '2'), '2 flag patterns');
  assert.equal(BN[flagCountText(2)].replace('{n}', '2'), '2টি পতাকার ধরন');
});
