import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { allowedOrigin, startDevKeyServer } from '../lib/dev-key.ts';

test('allowedOrigin: only the local dev origins pass', () => {
  assert.equal(allowedOrigin('http://localhost:3000'), true);
  assert.equal(allowedOrigin('http://127.0.0.1:3000'), true);
  assert.equal(allowedOrigin('http://192.168.1.5:3000'), false);
  assert.equal(allowedOrigin('http://localhost:3000.evil.com'), false);
  assert.equal(allowedOrigin(''), false);
  assert.equal(allowedOrigin(undefined), false);
});

process.env.TRADES_API_KEY = 'test-key-'.padEnd(40, 'x');
const server = startDevKeyServer(0)!; // port 0: a free port for the test
after(() => server.close());
const get = async (path: string, origin?: string) => {
  if (!server.listening) await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`, { headers: origin ? { origin } : {} });
};

test('server: allowed origin gets the key with an exact CORS header', async () => {
  const r = await get('/trades-key', 'http://localhost:3000');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { key: process.env.TRADES_API_KEY });
});

test('server: foreign or missing origin gets 403 and no CORS header', async () => {
  for (const origin of ['http://192.168.1.5:3000', undefined]) {
    const r = await get('/trades-key', origin);
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.equal(await r.text(), '');
  }
});

test('server: other paths are 404', async () => {
  assert.equal((await get('/', 'http://localhost:3000')).status, 404);
  assert.equal((await get('/trades-key?x=1', 'http://localhost:3000')).status, 404);
});
