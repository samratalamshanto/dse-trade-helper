import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, getJson } from '../src/api.ts';

const reply = (ok: boolean, status: number, body: unknown) => async () => ({ ok, status, json: async () => body });

test('joins base and path without a double slash and returns the body', async () => {
  let called = '';
  const body = await getJson<{ a: number }>('http://pc:3000/', '/api/x', async (url) => { called = url; return reply(true, 200, { a: 1 })(); });
  assert.equal(called, 'http://pc:3000/api/x');
  assert.deepEqual(body, { a: 1 });
});

test('a missing API URL gives a clear setup message', async () => {
  await assert.rejects(getJson(undefined, '/api/x'), (e: Error) => e instanceof ApiError && /EXPO_PUBLIC_API_URL/.test(e.message));
});

test('the server error text is shown when the API answers with an error', async () => {
  await assert.rejects(getJson('http://pc', '/api/x', reply(false, 502, { error: 'Live DSE data is not available now.' })), /Live DSE data is not available now/);
});

test('a non-JSON error body still gives the status code', async () => {
  const fetchFn = async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('bad'); } });
  await assert.rejects(getJson('http://pc', '/api/x', fetchFn), /Server answered 500/);
});

test('a network failure says the server cannot be reached', async () => {
  const fetchFn = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(getJson('http://pc', '/api/x', fetchFn), /Cannot reach the DSE server at http:\/\/pc/);
});
