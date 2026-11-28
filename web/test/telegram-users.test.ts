import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { encode } from 'next-auth/jwt';

// No company cache here: the alert check gets no live prices and skips company details.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'dse-tg-')));
const SECRET = 'test-secret-at-least-32-characters-long!!';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
Object.assign(process.env, {
  AUTH_SECRET: SECRET, AUTH_GOOGLE_ID: 'client-id', AUTH_GOOGLE_SECRET: 'client-secret',
  GOOGLE_SHEET_ID: 'ownerSheet', GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'sa@test.iam', private_key: privateKey }),
  TOKEN_ENC_KEY: randomBytes(32).toString('base64'), TELEGRAM_BOT_TOKEN: '123:bot', TELEGRAM_BOT_USERNAME: 'DseTestBot', TELEGRAM_WEBHOOK_SECRET: 'hook-secret_1',
});
delete process.env.TELEGRAM_CHAT_ID;

const { open, seal } = await import('../lib/token-box.ts');
const { claimLink, connectedMembers, renewMemberToken, startLink, LINK_TTL_MS } = await import('../lib/telegram-registry.ts');
const routes = await import('../lib/telegram-routes.ts');
const link = { POST: routes.linkPost, DELETE: routes.linkDelete };
const status = { GET: routes.statusGet };
const webhook = { POST: routes.webhookPost };
const { runMembers } = await import('../lib/notify-members.ts');

// In-memory Google Sheets shared by the whole file (lib/sheets.ts caches tab setup per process), plus fake sign-in and Telegram.
interface Fake { sheets: Map<string, Map<string, string[][]>>; sent: { chat: string; text: string }[]; sheetAuth: string[]; grants: Record<string, string> }
const STORE = new Map<string, Map<string, string[][]>>();
function fakeGoogle(t: TestContext): Fake {
  const f: Fake = { sheets: STORE, sent: [], sheetAuth: [], grants: {} };
  const tab = (id: string, title: string) => {
    if (!f.sheets.has(id)) f.sheets.set(id, new Map());
    const s = f.sheets.get(id)!;
    if (!s.has(title)) s.set(title, []);
    return s.get(title)!;
  };
  const ok = (b: unknown) => Response.json(b);
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = init.body ? String(init.body) : '';
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'refresh_token') {
        const tok = f.grants[p.get('refresh_token') ?? ''];
        return tok ? ok({ access_token: tok, expires_in: 3600 }) : Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      return ok({ access_token: 'sa-token', expires_in: 3600 });
    }
    if (url.startsWith('https://api.telegram.org/')) {
      const m = JSON.parse(body) as { chat_id: string; text: string };
      f.sent.push({ chat: m.chat_id, text: m.text });
      return ok({ ok: true });
    }
    const m = /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/([^/:?]+)(.*)$/.exec(url);
    if (!m) throw new Error(`offline: ${url}`);
    const id = decodeURIComponent(m[1]);
    const rest = decodeURIComponent(m[2]);
    f.sheetAuth.push(`${id} ${String((init.headers as Record<string, string>).authorization)}`);
    if (rest.startsWith('?fields=sheets')) return ok({ sheets: [...(f.sheets.get(id)?.keys() ?? [])].map((title, i) => ({ properties: { sheetId: i, title } })) });
    if (rest === ':batchUpdate') {
      const req = (JSON.parse(body) as { requests: { addSheet?: { properties: { title: string } }; deleteDimension?: { range: { sheetId: number; startIndex: number } } }[] }).requests[0];
      if (req.addSheet) { tab(id, req.addSheet.properties.title); return ok({ replies: [{ addSheet: { properties: { sheetId: f.sheets.get(id)!.size - 1 } } }] }); }
      const { sheetId, startIndex } = req.deleteDimension!.range;
      [...f.sheets.get(id)!.values()][sheetId].splice(startIndex, 1);
      return ok({});
    }
    const v = /^\/values\/([^!]+)!A(\d*):?([A-Z]?)(\d*)(:append|:clear)?/.exec(rest);
    if (!v) throw new Error(`unhandled ${rest}`);
    const rows = tab(id, v[1]);
    const from = Number(v[2] || 1), to = v[4] ? Number(v[4]) : v[3] ? Infinity : from;
    if (v[5] === ':append') { rows.push(...(JSON.parse(body) as { values: string[][] }).values); return ok({}); }
    if (init.method === 'PUT') { (JSON.parse(body) as { values: string[][] }).values.forEach((r, i) => { rows[from - 1 + i] = r; }); return ok({}); }
    const out = rows.slice(from - 1, to === Infinity ? undefined : to).map((r) => (v[3] ? r : [r[0]]));
    return ok({ values: out });
  });
  return f;
}

async function cookie(sub: string, sheetId: string, refreshToken: string): Promise<string> {
  const name = 'authjs.session-token';
  return `${name}=${await encode({ token: { sub, sheetId, refreshToken }, secret: SECRET, salt: name })}`;
}
const req = (method: string, c = '', extra: Record<string, string> = {}) => new Request('http://localhost:3000/api/telegram/link', { method, headers: { cookie: c, ...extra } });
const hook = (update: unknown, secret = 'hook-secret_1') => new Request('http://localhost:3000/api/telegram/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
const start = (code: string, chat = 555, type = 'private') => ({ update_id: 1, message: { chat: { id: chat, type }, text: `/start ${code}` } });
const registry = (f: Fake) => f.sheets.get('ownerSheet')!.get('telegram_users')!;
const rowOf = (f: Fake, sub: string) => registry(f).filter((r) => r[0] === sub);

test('token box: round trip; the stored form never contains the token; another key cannot open it', () => {
  const sealed = seal('1//refresh-token-abc');
  assert.equal(open(sealed), '1//refresh-token-abc');
  assert.ok(!sealed.includes('refresh-token'));
  assert.throws(() => open(seal('rt', 'user-a'), 'user-b'), 'a token copied to another user row cannot be opened');
  const keep = process.env.TOKEN_ENC_KEY;
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('base64');
  try { assert.throws(() => open(sealed)); } finally { process.env.TOKEN_ENC_KEY = keep; }
});

test('token box: a cut-short tag or body is refused', () => {
  const b = Buffer.from(seal('1//refresh-token-abc'), 'base64url');
  const shortTag = Buffer.concat([b.subarray(0, 12), b.subarray(12, 16)]).toString('base64url');
  assert.throws(() => open(shortTag), /too short/);
  assert.throws(() => open(b.subarray(0, 20).toString('base64url')), /too short/);
  assert.throws(() => open(''), /too short/);
});

test('connect route: signed out 401, other site 403; signed in gets a one-time bot link and an encrypted row', async (t) => {
  const f = fakeGoogle(t);
  assert.equal((await link.POST(req('POST'))).status, 401);
  const c = await cookie('g-1', 'sheetA', 'rt-A');
  assert.equal((await link.POST(req('POST', c, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  const res = await link.POST(req('POST', c));
  assert.equal(res.status, 200);
  const { url } = await res.json() as { url: string };
  assert.match(url, /^https:\/\/t\.me\/DseTestBot\?start=[A-Za-z0-9_-]{22}$/);
  const rows = rowOf(f, 'g-1');
  assert.equal(rows.length, 1);
  assert.equal(registry(f)[0][0], 'google_id', 'the tab has its header row');
  assert.ok(!rows[0].join('|').includes('rt-A'), 'refresh token is stored encrypted');
  assert.ok(!rows[0].join('|').includes(url.split('=')[1]), 'the code itself is not stored');
  assert.equal((await link.POST(req('POST', c))).status, 429, 'a second link within 30 s is refused');
  await startLink({ sub: 'g-1', sheetId: 'sheetA', refreshToken: 'rt-A' }, Date.now() + 60_000);
  assert.equal(rowOf(f, 'g-1').length, 1, 'a new code replaces the old one in the same row');
});

test('webhook: one /start per chat every few seconds; the rest is ignored without a reply', async (t) => {
  const f = fakeGoogle(t);
  await webhook.POST(hook(start('AAAAAAAAAAAAAAAAAAAAAA', 9090)));
  await webhook.POST(hook(start('BBBBBBBBBBBBBBBBBBBBBB', 9090)));
  assert.equal(f.sent.filter((s) => s.chat === '9090').length, 1);
});

test('webhook: wrong secret 401, group chat ignored, a valid code connects once and is then refused', async (t) => {
  const f = fakeGoogle(t);
  const { code } = await startLink({ sub: 'g-2', sheetId: 'sheetB', refreshToken: 'rt-B' });
  assert.equal((await webhook.POST(hook(start(code), 'wrong'))).status, 401);
  assert.equal((await webhook.POST(hook(start(code, 9, 'group')))).status, 200);
  assert.equal(rowOf(f, 'g-2')[0][3], '', 'a group chat never links');
  assert.equal((await webhook.POST(hook(start(code, 777)))).status, 200);
  assert.equal(rowOf(f, 'g-2')[0][3], '777');
  assert.deepEqual(f.sent.at(-1)?.chat, '777');
  assert.match(f.sent.at(-1)!.text, /Connected/);
  await webhook.POST(hook(start(code, 888)));
  assert.equal(rowOf(f, 'g-2')[0][3], '777', 'a used code cannot move the alerts to another chat');
  assert.match(f.sent.at(-1)!.text, /expired or was already used/);
});

test('link codes expire after 10 minutes, and a malformed code is refused', async (t) => {
  fakeGoogle(t);
  const now = Date.now();
  const { code } = await startLink({ sub: 'g-3', sheetId: 'sheetC', refreshToken: 'rt-C' }, now);
  assert.equal(await claimLink(code, '1', now + LINK_TTL_MS + 1), false);
  assert.equal(await claimLink('short', '1', now), false);
  assert.equal(await claimLink(code, '1', now + 1000), true);
});

test('status and disconnect: connected after Start; disconnect removes the row with its token', async (t) => {
  const f = fakeGoogle(t);
  const c = await cookie('g-4', 'sheetD', 'rt-D');
  const { url } = await (await link.POST(req('POST', c))).json() as { url: string };
  const get = () => status.GET(new Request('http://localhost:3000/api/telegram/status', { headers: { cookie: c } })).then((r) => r.json());
  assert.deepEqual(await get(), { connected: false, paused: false });
  await webhook.POST(hook(start(url.split('=')[1], 4242)));
  assert.deepEqual(await get(), { connected: true, paused: false });
  assert.equal((await link.DELETE(req('DELETE', c))).status, 200);
  const [row] = rowOf(f, 'g-4');
  assert.deepEqual([row[2], row[3]], ['', ''], 'token and chat are gone; the row keeps its place so others never shift');
  assert.deepEqual(await get(), { connected: false, paused: false });
});

test('alert job: each user is checked on their own Sheet with their own token; an ended sign-in is told once', async (t) => {
  const f = fakeGoogle(t);
  f.grants['rt-E'] = 'tok-E';
  for (const [sub, sheet, rt, chat] of [['g-5', 'sheetE', 'rt-E', '501'], ['g-6', 'sheetF', 'rt-F-revoked', '601']]) {
    const { code } = await startLink({ sub, sheetId: sheet, refreshToken: rt });
    await claimLink(code, chat);
  }
  const mine = (await connectedMembers()).filter((m) => ['g-5', 'g-6'].includes(m.googleId));
  assert.equal(mine.length, 2);
  const friday = new Date('2026-11-27T05:00:00Z');
  const first = await runMembers(friday);
  assert.equal(first.failed, first.users - 1, 'every user without a working sign-in fails, and only those');
  const userCalls = f.sheetAuth.filter((a) => a.startsWith('sheetE ') || a.startsWith('sheetF '));
  assert.ok(userCalls.length > 0 && userCalls.every((a) => a === 'sheetE Bearer tok-E'), 'each user Sheet is read only with its own token');
  assert.deepEqual(f.sent.filter((s) => s.chat === '601' || s.chat === '501').map((s) => s.chat), ['601'], 'the user whose sign-in ended is told');
  assert.match(f.sent.find((s) => s.chat === '601')!.text, /Sign in with Google again/);
  await runMembers(friday);
  assert.equal(f.sent.filter((s) => s.chat === '601').length, 1, 'not told again every 15 minutes');
  const rows = registry(f);
  assert.ok(JSON.parse(rows.find((r) => r[0] === 'g-5')![6]).lastRun, 'the working user gets its run saved');
  assert.ok(JSON.parse(rows.find((r) => r[0] === 'g-6')![6]).signInAsked, 'the paused user is marked');
  f.grants['rt-F-new'] = 'tok-F';
  await renewMemberToken({ sub: 'g-6', sheetId: 'sheetF', refreshToken: 'rt-F-new' });
  assert.equal(JSON.parse(rowOf(f, 'g-6')[0][6]).signInAsked, undefined, 'signing in again resumes alerts');
  f.sheetAuth.length = 0;
  await runMembers(friday);
  assert.ok(f.sheetAuth.some((a) => a === 'sheetF Bearer tok-F'), 'the renewed token is used on the next run');
});
