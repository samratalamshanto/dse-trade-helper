import assert from 'node:assert/strict';
import { test } from 'node:test';

const BASE = 'http://localhost:3000';

// Server availability is checked once and the Promise reused for all tests.
const serverAvailable: Promise<boolean> = fetch(`${BASE}/`, {
  signal: AbortSignal.timeout(2000),
}).then(
  (r) => r.status < 600,
  () => false,
);

async function req(url: string, opts?: RequestInit): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(5000), ...opts });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function checkApiBody(r: Response): Promise<{ error?: unknown }> {
  const ct = r.headers.get('content-type') ?? '';
  if (!ct.includes('json')) return {};
  try { return await r.json(); } catch { return {}; }
}

function assertNoStackTrace(text: string, label: string): void {
  assert.ok(!text.includes('/home/'), `file path in body for ${label}: ${text.slice(0, 200)}`);
  assert.ok(!/at \w+ \(/.test(text), `stack trace in body for ${label}: ${text.slice(0, 200)}`);
}

// ── Company endpoint: GET /api/company/<code> ─────────────────────────────────

const INVALID_CODES = [
  '',
  'has spaces',
  '<script>',
  '../../../etc/passwd',
  '%00',
  'A'.repeat(50),
  '测试',
  'ñame',
  '!@#$%',
  '\x00\x01',
  '%2F%2F',
  'A/B',
];

const FAKE_CODES = ['ZZZTEST', 'FAKESTK', 'NOEXIST1', 'ZFAKE99'];

test('http fuzz: /api/company – never 500, non-200 body has error string', async (t) => {
  if (!await serverAvailable) { t.skip('server not on :3000'); return; }

  const allowed = new Set([200, 400, 404, 502]);
  const counts: Record<number, number> = {};

  for (const code of INVALID_CODES) {
    const url = `${BASE}/api/company/${encodeURIComponent(code)}`;
    const r = await req(url);
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    assert.notEqual(r.status, 500, `500 for ${url}`);
    assert.ok(allowed.has(r.status), `unexpected status ${r.status} for ${url}`);
    if (r.status !== 200) {
      const ct = r.headers.get('content-type') ?? '';
      if (ct.includes('json')) {
        const body = await checkApiBody(r);
        assert.ok(typeof body.error === 'string', `no error field for ${url}: ${JSON.stringify(body)}`);
        assertNoStackTrace(JSON.stringify(body), url);
      }
    }
  }

  for (const code of FAKE_CODES) {
    const url = `${BASE}/api/company/${encodeURIComponent(code)}`;
    const r = await req(url);
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    assert.notEqual(r.status, 500, `500 for ${url}`);
    if (r.status !== 200) {
      const body = await checkApiBody(r);
      if (typeof body.error === 'string') assertNoStackTrace(body.error, url);
    }
  }

  // Extra: path-traversal and unicode directly in URL path
  const rawPaths = [
    `${BASE}/api/company/..`,
    `${BASE}/api/company/%2F%2F`,
    `${BASE}/api/company/${'A'.repeat(100)}`,
  ];
  for (const url of rawPaths) {
    const r = await req(url);
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    assert.notEqual(r.status, 500, `500 for ${url}`);
  }
});

// ── Page route: GET /c/<code> ─────────────────────────────────────────────────

const PAGE_CODES = [
  'GP', 'NONEXISTENT1', '', 'has spaces', '<script>', '../', '%00',
  'A'.repeat(50), '测试', 'ZZZFAKE',
];

test('http fuzz: /c/<code> page – never 500', async (t) => {
  if (!await serverAvailable) { t.skip('server not on :3000'); return; }

  for (const code of PAGE_CODES) {
    const url = `${BASE}/c/${encodeURIComponent(code)}`;
    const r = await req(url);
    assert.notEqual(r.status, 500, `500 for ${url}`);
    // Pages return 200 or 404; redirects (3xx) are also fine.
    assert.ok(r.status < 500, `server error ${r.status} for ${url}`);
  }
});

// ── Trades endpoints: no key → never 500, never 200 ──────────────────────────

const RANDOM_BODIES = [
  undefined,
  '{}',
  '{"date":"2026-11-19","code":"GP","side":"BUY","quantity":1,"price":100}',
  'not json',
  '[]',
  '',
  '{"x":' + 'a'.repeat(5000) + '}',
];

async function tradeReq(
  method: string,
  path: string,
  body?: string,
): Promise<Response> {
  const noBody = method === 'GET' || method === 'HEAD';
  const headers: Record<string, string> = {};
  if (!noBody && body !== undefined) headers['Content-Type'] = 'application/json';
  return req(`${BASE}${path}`, { method, body: noBody ? undefined : body, headers });
}

test('http fuzz: /api/trades without key – never 200, never 500', async (t) => {
  if (!await serverAvailable) { t.skip('server not on :3000'); return; }

  const paths = ['/api/trades', '/api/trades/FAKEID123', '/api/trades/import'];
  const methods: Array<[string, string, string | undefined]> = [
    ['GET', '/api/trades', undefined],
    ['POST', '/api/trades', '{}'],
    ['PUT', '/api/trades/FAKEID123', '{"price":99}'],
    ['DELETE', '/api/trades/FAKEID123', undefined],
    ['POST', '/api/trades/import', undefined],
  ];

  for (const [method, path, body] of methods) {
    for (const payload of RANDOM_BODIES.slice(0, 3)) {
      const r = await tradeReq(method, path, payload ?? body);
      assert.notEqual(r.status, 500, `500 for ${method} ${path}`);
      assert.notEqual(r.status, 200, `200 without key for ${method} ${path}`);
      // 401, 503 (no key configured), 405 (method not allowed) are all acceptable.
      assert.ok(r.status < 500 || r.status === 503, `unexpected ${r.status} for ${method} ${path}`);
      const body2 = await checkApiBody(r);
      if (typeof body2.error === 'string') {
        assertNoStackTrace(body2.error, `${method} ${path}`);
      }
    }
  }
});

test('http fuzz: /api/trades random wrong key headers – never 200, never 500', async (t) => {
  if (!await serverAvailable) { t.skip('server not on :3000'); return; }

  const wrongKeys = [
    'wrongkey',
    '',
    'x'.repeat(64),
    'Bearer token',
    '0'.repeat(32),
  ];

  for (const key of wrongKeys) {
    const r = await req(`${BASE}/api/trades`, {
      headers: { 'x-trades-key': key },
    });
    assert.notEqual(r.status, 500, `500 with key "${key.slice(0, 10)}..."`);
    assert.notEqual(r.status, 200, `200 with wrong key "${key.slice(0, 10)}..."`);
  }
});

// ── Page routes with random query strings: never 500 ─────────────────────────

const QUERY_STRINGS = [
  '',
  '?q=GP',
  '?codes=GP,BXPHARMA',
  '?codes=<script>alert(1)</script>',
  '?foo=bar&baz=qux',
  '?q=' + 'A'.repeat(500),
  '?codes=%00%01%02',
  '?page=-1&limit=99999',
  '?date=not-a-date',
  `?codes=${'A'.repeat(200)}`,
];

for (const path of ['/all', '/dividends', '/compare']) {
  test(`http fuzz: ${path} with random query strings – never 500`, async (t) => {
    if (!await serverAvailable) { t.skip('server not on :3000'); return; }
    for (const qs of QUERY_STRINGS) {
      const url = `${BASE}${path}${qs}`;
      const r = await req(url);
      assert.notEqual(r.status, 500, `500 for ${url}`);
      assert.ok(r.status < 500 || r.status === 503, `server error ${r.status} for ${url}`);
    }
  });
}

// ── Misc API endpoints with random query strings ──────────────────────────────

test('http fuzz: /api/companies with random query strings – never 500', async (t) => {
  if (!await serverAvailable) { t.skip('server not on :3000'); return; }

  for (const qs of QUERY_STRINGS) {
    const url = `${BASE}/api/companies${qs}`;
    const r = await req(url);
    assert.notEqual(r.status, 500, `500 for ${url}`);
  }
});

test('http fuzz: /api/dividends with random query strings – never 500', async (t) => {
  if (!await serverAvailable) { t.skip('server not on :3000'); return; }

  for (const qs of QUERY_STRINGS) {
    const url = `${BASE}/api/dividends${qs}`;
    const r = await req(url);
    assert.notEqual(r.status, 500, `500 for ${url}`);
  }
});
