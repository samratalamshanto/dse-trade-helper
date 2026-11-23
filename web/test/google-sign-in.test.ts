import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { encode } from 'next-auth/jwt';
import { readRows, serialPerSheet, withSheet, type SheetTarget } from '../lib/sheets.ts';
import { findOrCreateSheet, SIGN_IN_AGAIN, sheetUrl, userTarget } from '../lib/google-user.ts';
import { tradesRoute } from '../lib/trades-http.ts';

const SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.AUTH_SECRET = SECRET;
process.env.AUTH_GOOGLE_ID = 'client-id';
process.env.AUTH_GOOGLE_SECRET = 'client-secret';
delete process.env.GOOGLE_SHEET_ID;
delete process.env.TRADES_API_KEY;

type Seen = { url: string; auth: string; method: string; body: string };
// Fakes Google: Sheets answers an empty "trades" tab with the right header; the given handler answers anything else.
function fakeGoogle(t: TestContext, other: (s: Seen) => Response | undefined = () => undefined): Seen[] {
  const seen: Seen[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit = {}) => {
    const s = { url: String(input), auth: String((init.headers as Record<string, string> | undefined)?.authorization ?? ''), method: init.method ?? 'GET', body: String(init.body ?? '') };
    seen.push(s);
    const answer = other(s);
    if (answer) return answer;
    if (s.url.includes('fields=sheets.properties')) return Response.json({ sheets: [{ properties: { sheetId: 0, title: 'trades' } }] });
    if (s.url.includes('A1:')) return Response.json({ values: [['id', 'date', 'code', 'side', 'quantity', 'price', 'commission', 'note', 'source', 'created_at', 'account']] });
    return Response.json({ values: [] });
  });
  return seen;
}

const target = (sheetId: string, token: string): SheetTarget => ({ sheetId, accessToken: async () => token, dropToken: () => {} });

test('two users read in parallel: each request goes to its own Sheet with its own token', async (t) => {
  const seen = fakeGoogle(t);
  await Promise.all([withSheet(target('sheetA', 'tokA'), () => readRows()), withSheet(target('sheetB', 'tokB'), () => readRows())]);
  const a = seen.filter((s) => s.url.includes('/sheetA')), b = seen.filter((s) => s.url.includes('/sheetB'));
  assert.ok(a.length >= 3 && b.length >= 3, 'each Sheet gets its own tab setup and read');
  assert.ok(a.every((s) => s.auth === 'Bearer tokA'));
  assert.ok(b.every((s) => s.auth === 'Bearer tokB'));
});

test('write queue: same Sheet runs one at a time, another Sheet is not held up', async () => {
  const serial = serialPerSheet();
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const a1 = withSheet(target('qA', 't'), () => serial(async () => { order.push('a1 start'); await gate; order.push('a1 end'); }));
  const a2 = withSheet(target('qA', 't'), () => serial(async () => { order.push('a2'); }));
  await withSheet(target('qB', 't'), () => serial(async () => { order.push('b'); }));
  assert.deepEqual(order, ['a1 start', 'b']);
  release();
  await Promise.all([a1, a2]);
  assert.deepEqual(order, ['a1 start', 'b', 'a1 end', 'a2']);
});

test('user token: sign-in token is used while valid, then refreshed; a revoked grant asks to sign in again', async (t) => {
  let grant = 'ok';
  const seen = fakeGoogle(t, (s) => {
    if (!s.url.startsWith('https://oauth2.googleapis.com/token')) return undefined;
    return grant === 'ok' ? Response.json({ access_token: 'fresh', expires_in: 3600 }) : Response.json({ error: 'invalid_grant' }, { status: 400 });
  });
  const live = userTarget({ sub: 'u1', sheetId: 's1', refreshToken: 'r1', accessToken: 'from-sign-in', expiresAt: Date.now() / 1000 + 3600 });
  assert.equal(await live.accessToken(), 'from-sign-in');
  const expired = userTarget({ sub: 'u2', sheetId: 's2', refreshToken: 'r2', accessToken: 'old', expiresAt: Date.now() / 1000 - 10 });
  assert.equal(await expired.accessToken(), 'fresh');
  assert.match(seen.find((s) => s.url.includes('oauth2'))!.body, /grant_type=refresh_token/);
  grant = 'revoked';
  await assert.rejects(userTarget({ sub: 'u3', sheetId: 's3', refreshToken: 'r3' }).accessToken(), (e: Error & { status?: number }) => e.message === SIGN_IN_AGAIN && e.status === 401);
});

test('first sign-in reuses the marked Sheet, or makes one with the mark', async (t) => {
  let files: { id: string }[] = [{ id: 'old-sheet' }];
  const seen = fakeGoogle(t, (s) => {
    if (!s.url.startsWith('https://www.googleapis.com/drive/v3/files')) return undefined;
    return s.method === 'POST' ? Response.json({ id: 'new-sheet' }) : Response.json({ files });
  });
  assert.equal(await findOrCreateSheet('tok'), 'old-sheet');
  assert.match(decodeURIComponent(seen[0].url), /appProperties has \{ key='dseTradeHelper' and value='1' \} and trashed = false/);
  files = [];
  assert.equal(await findOrCreateSheet('tok'), 'new-sheet');
  const made = JSON.parse(seen.at(-1)!.body);
  assert.deepEqual(made, { name: 'DSE Trade Helper', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { dseTradeHelper: '1' } });
});

// A real Auth.js session cookie (same encoding and salt as next-auth uses on http).
async function sessionCookie(sheetId: string): Promise<string> {
  const name = 'authjs.session-token';
  const jwt = await encode({ token: { sub: 'g-123', sheetId, accessToken: 'tok-user', expiresAt: Date.now() / 1000 + 3600, refreshToken: 'r' }, secret: SECRET, salt: name });
  return `${name}=${jwt}`;
}

test('route: signed-in user works on the Sheet from the cookie, never one named in the request', async (t) => {
  const seen = fakeGoogle(t);
  const req = new Request('http://localhost:3000/api/trades?sheetId=evil', { headers: { cookie: await sessionCookie('mine') } });
  const res = await tradesRoute(req, 'list', () => readRows());
  assert.equal(res.status, 200);
  assert.ok(seen.length > 0 && seen.every((s) => s.url.includes('/mine') && s.auth === 'Bearer tok-user'));
});

test('route: a cross-site or same-site request with the session cookie is refused', async () => {
  for (const site of ['cross-site', 'same-site']) {
    const req = new Request('http://localhost:3000/api/trades', { method: 'POST', headers: { cookie: await sessionCookie('mine'), 'sec-fetch-site': site } });
    assert.equal((await tradesRoute(req, 'add', async () => assert.fail('must not run'))).status, 403, site);
  }
});

test('route: the __Secure- cookie name used on https is found', async (t) => {
  const seen = fakeGoogle(t);
  const name = '__Secure-authjs.session-token';
  const jwt = await encode({ token: { sub: 'g-9', sheetId: 'secure-sheet', accessToken: 'tok-s', expiresAt: Date.now() / 1000 + 3600 }, secret: SECRET, salt: name });
  const req = new Request('http://internal/api/trades', { headers: { cookie: `${name}=${jwt}`, 'sec-fetch-site': 'same-origin' } });
  assert.equal((await tradesRoute(req, 'list', () => readRows())).status, 200);
  assert.ok(seen.every((s) => s.url.includes('/secure-sheet')));
});

test('route: a forged or missing cookie falls back to the key check', async () => {
  const forged = new Request('http://localhost:3000/api/trades', { headers: { cookie: 'authjs.session-token=not-a-jwt' } });
  // No TRADES_API_KEY in this test: the key path is closed (503), and the work never runs.
  assert.equal((await tradesRoute(forged, 'list', async () => assert.fail('must not run'))).status, 503);
  const owner = new Request('http://localhost:3000/api/notify/test', { method: 'POST', headers: { cookie: await sessionCookie('mine') } });
  assert.equal((await tradesRoute(owner, 'notify test', async () => assert.fail('must not run'), { ownerOnly: true })).status, 503);
});

test('the browser gets only a link to the own Sheet, and only for a well-formed id', () => {
  assert.equal(sheetUrl('1AbC-def_ghi1234567'), 'https://docs.google.com/spreadsheets/d/1AbC-def_ghi1234567/edit');
  for (const bad of [undefined, '', 'short', '1AbC/../evil0000', 'x"><script>', 42]) assert.equal(sheetUrl(bad), undefined, String(bad));
});
