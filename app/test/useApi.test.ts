import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultFor } from '../src/useApi.ts';

test('a result is shown only for the path it was loaded for', () => {
  const gp = { path: '/api/company/GP', data: { code: 'GP' }, error: null };
  assert.equal(resultFor(gp, '/api/company/GP'), gp);
  assert.equal(resultFor(gp, '/api/company/BATBC'), null);
  assert.equal(resultFor(null, '/api/company/GP'), null);
});

test('an error for the new company is not hidden behind the old company data', () => {
  const failed = { path: '/api/company/BATBC', data: null, error: 'Server answered 502.' };
  assert.deepEqual(resultFor(failed, '/api/company/BATBC'), failed);
});
