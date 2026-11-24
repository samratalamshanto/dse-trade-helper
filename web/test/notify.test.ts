import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { alertsFor, buildChunks, decide, dhakaClock, emptyState, inMarketWindow, isQuiet, nextState, readState, summaryDue, summaryText, writeState, type NotifyInput } from '../lib/notify.ts';
import { escapeHtml, sendMessage, telegramEnabled } from '../lib/telegram.ts';

// 2026-11-19 is a Thursday; Dhaka is UTC+6, so 03:45Z is 09:45 Dhaka.
const at = (iso: string) => dhakaClock(Date.parse(iso));
const THU_0945 = at('2026-11-19T03:45:00Z');

const base = (over: Partial<NotifyInput> = {}): NotifyInput => ({
  clock: at('2026-11-19T04:00:00Z'), plans: [], holdings: [], owned: [], rangeRules: [], rangeRows: [], watchlist: [], lastBuyDates: {}, dayPl: null, picks: [], ...over,
});

test('Dhaka clock: date, tomorrow, minutes and Sun-Thu trading days', () => {
  assert.deepEqual(THU_0945, { date: '2026-11-19', tomorrow: '2026-11-22', minutes: 9 * 60 + 45, tradingDay: true });
  assert.equal(at('2026-11-20T04:00:00Z').tradingDay, false, 'Friday');
  assert.equal(at('2026-11-21T04:00:00Z').tradingDay, false, 'Saturday');
  assert.equal(at('2026-11-22T04:00:00Z').tradingDay, true, 'Sunday');
  assert.equal(at('2026-11-19T19:00:00Z').date, '2026-11-20', '01:00 Dhaka is already the next day');
});

test('market window 09:30-15:00 and the 09:45 summary only on trading days', () => {
  assert.equal(inMarketWindow(at('2026-11-19T03:29:00Z')), false);
  assert.equal(inMarketWindow(at('2026-11-19T03:30:00Z')), true);
  assert.equal(inMarketWindow(at('2026-11-19T09:00:00Z')), false, '15:00');
  assert.equal(summaryDue(at('2026-11-19T03:44:00Z')), false);
  assert.equal(summaryDue(THU_0945), true);
  assert.equal(summaryDue(at('2026-11-20T03:45:00Z')), false, 'Friday');
});

test('quiet hours are 22:00-08:00 Dhaka', () => {
  assert.equal(isQuiet(at('2026-11-19T16:00:00Z')), true, '22:00');
  assert.equal(isQuiet(at('2026-11-19T01:59:00Z')), true, '07:59');
  assert.equal(isQuiet(at('2026-11-19T02:00:00Z')), false, '08:00');
  assert.equal(isQuiet(at('2026-11-19T15:59:00Z')), false, '21:59');
});

test('a reached buy plan shows target price, current price when available, and links to the company page', () => {
  const plans = [
    { id: 'p1', code: 'GP', until: null, targetPrice: 222.2, ltp: 218.5, live: { status: 'reached', remaining: 5 } },
    { id: 'p2', code: 'BATBC', until: '2026-11-22', targetPrice: 300, live: { status: 'waiting', remaining: 3 } },
    { id: 'p3', code: 'X', until: '2026-11-22', targetPrice: 1, live: { status: 'cancelled', remaining: 3 } },
  ];
  const a = alertsFor(base({ plans }), {});
  assert.deepEqual(a.map((x) => x.key), ['plan:p1:reached:2026-11-19', 'plan:p2:expiring:2026-11-22']);
  assert.match(a[0].text, /GP.*৳222\.20.*current price ৳218\.50.*5 shares left/);
  assert.match(a[0].text, /https:\/\/dse-trade-helper.vercel.app\/c\/GP/);
});

test('a reached plan with no live price omits current price but still links', () => {
  const plans = [{ id: 'p1', code: 'GP', until: null, targetPrice: 100, live: { status: 'reached', remaining: 1 } }];
  const a = alertsFor(base({ plans }), {});
  assert.doesNotMatch(a[0].text, /current price/);
  assert.match(a[0].text, /৳100\.00.*1 shares left.*\/c\/GP/);
});

test('a holding alerts only when its check changes to Review or Take profit', () => {
  const holdings = [
    { code: 'AAA', shares: 10, value: 100, check: { action: 'review', reasons: ['Down 12% <stop>'] } },
    { code: 'BBB', shares: 10, value: 100, check: { action: 'take-profit', reasons: [] } },
    { code: 'CCC', shares: 10, value: 100, check: { action: 'hold', reasons: [] } },
    { code: 'DDD', shares: 0, value: 0, check: { action: 'review', reasons: [] } },
  ];
  const a = alertsFor(base({ holdings }), { BBB: 'take-profit' });
  assert.deepEqual(a.map((x) => x.key), ['pos:AAA:review:2026-11-19']);
  assert.match(a[0].text, /Review: stop-loss or a warning\n• Down 12% &lt;stop&gt;/);
});

test('a held company whose dividend last-buy day is today or the next trading day alerts', () => {
  const holdings = [{ code: 'AAA', shares: 1, value: 1, check: null }, { code: 'BBB', shares: 1, value: 1, check: null }, { code: 'CCC', shares: 1, value: 1, check: null }];
  const a = alertsFor(base({ holdings, lastBuyDates: { AAA: '2026-11-19', BBB: '2026-11-22', CCC: '2026-11-25' } }), {});
  assert.deepEqual(a.map((x) => x.key), ['div:AAA:2026-11-19', 'div:BBB:2026-11-22']);
  assert.match(a[0].text, /today \(2026-11-19\)/);
  assert.match(a[1].text, /next trading day/);
});

test('the morning summary includes pick price and reason, and no footer', () => {
  const s = summaryText(base({
    clock: THU_0945, dayPl: -1234.4,
    holdings: [{ code: 'A', shares: 1, value: 12345.6, check: null }],
    plans: [{ id: '1', code: 'A', until: null, targetPrice: 1, live: { status: 'reached', remaining: 1 } }, { id: '2', code: 'B', until: null, targetPrice: 1, live: { status: 'waiting', remaining: 1 } }],
    picks: [{ code: 'A&B', name: 'x', price: 10, reason: 'lower half of its 52-week range' }],
  }));
  assert.equal(s, '<b>Morning summary (DSE data) — 2026-11-19</b>\nHoldings: ৳12,346 (today -৳1,234)\nBuy plans: 1 reached, 1 waiting\nResearch list: A&amp;B ৳10.00 (lower half of its 52-week range) — https://dse-trade-helper.vercel.app/c/A%26B');
});

test('dedupe: a sent key is never sent again; the summary comes once a day after 09:45', () => {
  const input = base({ clock: THU_0945, plans: [{ id: 'p1', code: 'GP', until: null, targetPrice: 1, live: { status: 'reached', remaining: 1 } }] });
  const first = decide(input, emptyState());
  assert.deepEqual(first.due.map((a) => a.key), ['plan:p1:reached:2026-11-19', 'summary:2026-11-19']);
  const after = nextState(emptyState(), input, first.due.map((a) => a.key), [], '2026-11-19T03:45:00.000Z');
  assert.deepEqual(decide(input, after).due, []);
  assert.equal(after.lastSent, '2026-11-19T03:45:00.000Z');
  assert.equal(after.pending, 0);
});

test('quiet hours hold alerts back as pending and keep the old action so they send later', () => {
  const holdings = [{ code: 'AAA', shares: 1, value: 1, check: { action: 'review', reasons: [] } }];
  const night = base({ clock: at('2026-11-19T17:00:00Z'), holdings });
  const d = decide(night, emptyState());
  assert.equal(d.due.length, 0);
  assert.equal(d.held.length, 1);
  const s = nextState(emptyState(), night, [], d.held, '2026-11-19T17:00:00.000Z');
  assert.equal(s.pending, 1);
  assert.equal(s.actions.AAA, '');
  assert.equal(decide(base({ clock: at('2026-11-20T04:00:00Z'), holdings }), s).due.length, 1);
});

test('old sent keys are pruned after 30 days', () => {
  const s = nextState({ ...emptyState(), sent: { old: '2026-10-01T00:00:00.000Z', recent: '2026-11-18T00:00:00.000Z' } }, base(), [], [], '2026-11-19T00:00:00.000Z');
  assert.deepEqual(Object.keys(s.sent), ['recent']);
});

test('state file round-trips with an atomic write; a missing file is a fresh state', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notify-')), 'sub', 'notify-state.json');
  assert.deepEqual(readState(file), emptyState());
  const s = { ...emptyState(), sent: { k: '2026-11-19T00:00:00.000Z' }, budget: 5000 };
  writeState(s, file);
  assert.deepEqual(readState(file), s);
  assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('HTML escaping covers <, > and &', () => {
  assert.equal(escapeHtml('a < b && c > d'), 'a &lt; b &amp;&amp; c &gt; d');
});

function withEnv(token: string | undefined, chat: string | undefined, fn: () => Promise<void>) {
  return async () => {
    const old = [process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID];
    if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = token;
    if (chat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = chat;
    try { await fn(); } finally {
      if (old[0] === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = old[0];
      if (old[1] === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = old[1];
    }
  };
}

const fail = (() => { throw new Error('no network in tests'); }) as unknown as typeof fetch;

test('disabled when either env var is missing: no call, a clear reason', withEnv('tok', undefined, async () => {
  assert.equal(telegramEnabled(), false);
  const r = await sendMessage('hi', fail);
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID/);
}));

test('sendMessage posts HTML with link previews off', withEnv('SECRET123', '42', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({ ok: true, result: {} });
  }) as unknown as typeof fetch;
  assert.deepEqual(await sendMessage('<b>x</b>', ok), { ok: true });
  assert.equal(calls[0].url, 'https://api.telegram.org/botSECRET123/sendMessage');
  assert.deepEqual(calls[0].body, { chat_id: '42', text: '<b>x</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}));

test('sendMessage retries once on a network error and never logs the token', withEnv('SECRET123', '42', async () => {
  let n = 0;
  const flaky = (async () => { n++; if (n === 1) throw new TypeError('fetch failed for https://api.telegram.org/botSECRET123/sendMessage'); return Response.json({ ok: true }); }) as unknown as typeof fetch;
  assert.deepEqual(await sendMessage('x', flaky), { ok: true });
  assert.equal(n, 2);

  const logged: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const down = (async () => { throw new TypeError('connect failed https://api.telegram.org/botSECRET123/sendMessage'); }) as unknown as typeof fetch;
    const r = await sendMessage('x', down);
    assert.equal(r.ok, false);
    const refused = (async () => Response.json({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, { status: 400 })) as unknown as typeof fetch;
    const r2 = await sendMessage('x', refused);
    assert.equal(r2.error, 'Telegram could not deliver to that chat. Send your bot a message first and check TELEGRAM_CHAT_ID.');
  } finally { console.error = orig; }
  assert.equal(logged.length, 2);
  assert.ok(!JSON.stringify(logged.map((a) => a.map((x) => (x instanceof Error ? x.message : x)))).includes('SECRET123'));
}));

test('sendMessage does not retry after a timeout, because the first POST may already be delivered', withEnv('SECRET123', '42', async () => {
  let n = 0;
  const slow = (async () => { n++; throw new DOMException('The operation timed out.', 'TimeoutError'); }) as unknown as typeof fetch;
  const orig = console.error;
  console.error = () => {};
  try { assert.equal((await sendMessage('x', slow)).ok, false); } finally { console.error = orig; }
  assert.equal(n, 1);
}));

test('Thursday: the next trading day is Sunday, so a Sunday last-buy day alerts on Thursday', () => {
  const thu = dhakaClock(Date.UTC(2026, 10, 19, 4, 0));
  assert.equal(thu.tomorrow, '2026-11-22');
  assert.equal(dhakaClock(Date.UTC(2026, 10, 17, 4, 0)).tomorrow, '2026-11-18');
});

test('range rule match lines include price, 52-week low, and high', () => {
  const rule = { id: 'nr1', kind: 'nearLow' as const, pct: 10, scope: 'all' as const };
  const row = { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 };
  const a = alertsFor(base({ rangeRules: [rule], rangeRows: [row], owned: [] }), {});
  assert.deepEqual(a.map((x) => x.key), ['range:nr1:2026-11-19']);
  assert.equal(a[0].text, '<b>Your rule:</b> within 10% of the 52-week low (all companies)\n• <b>GP</b> ৳220.00 (low ৳200.00, high ৳300.00): 10% above its 52-week low — https://dse-trade-helper.vercel.app/c/GP');
});

test('range match line omits numbers when price or range is missing', () => {
  const rule = { id: 'nr1', kind: 'nearLow' as const, pct: 10, scope: 'all' as const };
  const row = { code: 'GP', price: 220, weekLow52: null, weekHigh52: null };
  const a = alertsFor(base({ rangeRules: [rule], rangeRows: [row as never], owned: [] }), {});
  assert.doesNotMatch(a[0]?.text ?? '', /৳/);
});

test('a range that looks wrong never goes out in a range summary', () => {
  const rule = { id: 'nr1', kind: 'nearLow' as const, pct: 100, scope: 'all' as const };
  const a = alertsFor(base({ rangeRules: [rule], rangeRows: [{ code: 'EXIMBANK', price: 3, weekLow52: 245.25, weekHigh52: 466.75 }], owned: [] }), {});
  assert.equal(a.filter((x) => x.key.startsWith('range:')).length, 0);
});

test('a wide rule lists only the closest 10 companies and counts the rest', () => {
  const rule = { id: 'wide', kind: 'nearLow' as const, pct: 50, scope: 'all' as const };
  const rows = Array.from({ length: 15 }, (_, i) => ({ code: `C${String(i).padStart(2, '0')}`, price: 100 + i, weekLow52: 100, weekHigh52: 300 }));
  const a = alertsFor(base({ rangeRules: [rule], rangeRows: rows, owned: [] }), {}).filter((x) => x.key.startsWith('range:'));
  assert.equal(a.length, 1);
  const lines = a[0].text.split('\n');
  assert.equal(lines.filter((l) => l.startsWith('• ')).length, 10);
  assert.match(lines[1], /C00/);
  assert.equal(lines.at(-1), '…and 5 more on the 52-week range page');
});

test('the same range match does not repeat on the same day (decide + sent state)', () => {
  const rule = { id: 'nr1', kind: 'nearLow' as const, pct: 10, scope: 'all' as const };
  const row = { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 };
  const input = base({ rangeRules: [rule], rangeRows: [row], owned: [] });
  const first = decide(input, emptyState());
  assert.equal(first.due.some((a) => a.key === 'range:nr1:2026-11-19'), true);
  const after = nextState(emptyState(), input, first.due.map((a) => a.key), [], '2026-11-19T04:00:00.000Z');
  assert.deepEqual(decide(input, after).due.filter((a) => a.key.startsWith('range:')), []);
});

test('no range alerts without rules', () => {
  const row = { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 };
  const a = alertsFor(base({ rangeRules: [], rangeRows: [row], owned: [] }), {});
  assert.equal(a.filter((x) => x.key.startsWith('range:')).length, 0);
});

test('holdings-scope range rule ignores non-held codes', () => {
  const rule = { id: 'h1', kind: 'nearLow' as const, pct: 10, scope: 'holdings' as const };
  const rows = [{ code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 }, { code: 'ROBI', price: 30, weekLow52: 28, weekHigh52: 50 }];
  const a = alertsFor(base({ rangeRules: [rule], rangeRows: rows, owned: [{ code: 'ROBI', shares: 10, avgCost: 28 }] }), {});
  const range = a.filter((x) => x.key.startsWith('range:'));
  assert.deepEqual(range.map((x) => x.key), ['range:h1:2026-11-19']);
  assert.match(range[0].text, /ROBI/);
  assert.doesNotMatch(range[0].text, /GP/);
});

test('a rule with a pick excludes a company that fails the pick', () => {
  const rule = { id: 'rp1', kind: 'nearLow' as const, pct: 20, scope: 'all' as const, pick: 'good' as const };
  const rangeRows = [
    { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 },
    { code: 'ROBI', price: 30, weekLow52: 28, weekHigh52: 50 },
  ];
  const companies = [
    { code: 'GP', name: 'GP', sector: 'Telecom', category: 'A', price: 220, changePct: 0, signal: 'research', score: 60, quality: 'high', fraud: 'clean', flags: [], pe: 10, dividendYield: 3, epsCagr: 10, change1y: 5, dailyValue: 2_000_000, weekHigh52: 300, weekLow52: 200, stale: false },
    { code: 'ROBI', name: 'ROBI', sector: 'Telecom', category: 'B', price: 30, changePct: 0, signal: 'avoid', score: 20, quality: 'low', fraud: 'warn', flags: [], pe: 5, dividendYield: 1, epsCagr: -5, change1y: -10, dailyValue: 500_000, weekHigh52: 50, weekLow52: 28, stale: false },
  ];
  const a = alertsFor(base({ rangeRules: [rule], rangeRows, companies: companies as never, owned: [] }), {});
  const range = a.filter((x) => x.key.startsWith('range:'));
  assert.equal(range.length, 1, 'one alert for the matching rule');
  assert.match(range[0].text, /GP/, 'GP has signal=research so passes the good pick');
  assert.doesNotMatch(range[0].text, /ROBI/, 'ROBI has signal=avoid so fails the good pick');
});

test('stale session date skips plan-reached, holding-action, and range alerts but keeps dividend and expiry alerts', () => {
  const plans = [
    { id: 'p1', code: 'GP', until: null, targetPrice: 100, live: { status: 'reached', remaining: 1 } },
    { id: 'p2', code: 'BATBC', until: '2026-11-22', targetPrice: 300, live: { status: 'waiting', remaining: 2 } },
  ];
  const holdings = [
    { code: 'AAA', shares: 1, value: 1, check: { action: 'review', reasons: ['Stop hit'] } },
    { code: 'DIV', shares: 1, value: 1, check: null },
  ];
  const rule = { id: 'r1', kind: 'nearLow' as const, pct: 10, scope: 'all' as const };
  const row = { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 };
  const input = base({
    plans, holdings,
    lastBuyDates: { DIV: '2026-11-19' },
    rangeRules: [rule], rangeRows: [row],
    sessionDate: '2026-11-18',
  });
  const a = alertsFor(input, {});
  const keys = a.map((x) => x.key);
  assert.equal(keys.includes('plan:p1:reached:2026-11-19'), false, 'reached plan skipped on stale data');
  assert.equal(keys.includes('pos:AAA:review:2026-11-19'), false, 'holding action skipped on stale data');
  assert.equal(a.filter((x) => x.key.startsWith('range:')).length, 0, 'range alerts skipped on stale data');
  assert.equal(keys.includes('plan:p2:expiring:2026-11-22'), true, 'expiry alert kept');
  assert.equal(keys.includes('div:DIV:2026-11-19'), true, 'dividend alert kept');
});

test('sessionDate equal to today does not skip price-sensitive alerts', () => {
  const plans = [{ id: 'p1', code: 'GP', until: null, targetPrice: 100, live: { status: 'reached', remaining: 1 } }];
  const a = alertsFor(base({ plans, sessionDate: '2026-11-19' }), {});
  assert.equal(a.some((x) => x.key === 'plan:p1:reached:2026-11-19'), true);
});

test('null sessionDate on a trading day is treated as stale (session fetch failed); on a non-trading day it is not', () => {
  const plans = [{ id: 'p1', code: 'GP', until: null, targetPrice: 100, live: { status: 'reached', remaining: 1 } }];
  const tradingDay = alertsFor(base({ plans, sessionDate: null }), {}); // base() clock is Thursday
  assert.equal(tradingDay.some((x) => x.key === 'plan:p1:reached:2026-11-19'), false, 'stale on trading day');
  const friday = { ...base({ plans, sessionDate: null }), clock: at('2026-11-20T04:00:00Z') }; // Friday
  assert.equal(alertsFor(friday, {}).some((x) => x.key.startsWith('plan:p1:reached')), true, 'not stale on non-trading day');
});

test('dataError adds a data-error alert once per day, deduped by decide', () => {
  const a = alertsFor(base({ dataError: true }), {});
  assert.equal(a.length, 1);
  assert.equal(a[0].key, 'data-error:2026-11-19');
  assert.match(a[0].text, /could not read DSE data/);

  const withState = decide(base({ dataError: true }), { ...emptyState(), sent: { 'data-error:2026-11-19': '2026-11-19T04:00:00.000Z' } });
  assert.equal(withState.due.filter((x) => x.key.startsWith('data-error:')).length, 0, 'second check same day: no duplicate');
});

test('buildChunks wraps alerts in header + footer and returns empty for no alerts', () => {
  assert.deepEqual(buildChunks([], 'Header', 'Footer'), []);

  const due = [{ key: 'k1', text: 'Alert one' }, { key: 'k2', text: 'Alert two' }];
  const chunks = buildChunks(due, 'Header', 'Footer');
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].keys, ['k1', 'k2']);
  assert.match(chunks[0].text, /^Header\n\nAlert one\n\nAlert two\n\n<i>Footer<\/i>$/);
});

test('buildChunks splits into multiple messages when combined text exceeds maxLen', () => {
  const big = 'x'.repeat(2100);
  const due = [{ key: 'k1', text: big }, { key: 'k2', text: big }];
  const chunks = buildChunks(due, 'H', 'F', 4096);
  assert.equal(chunks.length, 2, 'two alerts each 2100 chars exceed 4096 combined so split into two messages');
  assert.deepEqual(chunks[0].keys, ['k1']);
  assert.deepEqual(chunks[1].keys, ['k2']);
  assert.ok(chunks[0].text.length <= 4096);
  assert.ok(chunks[1].text.length <= 4096);
});

test('buildChunks keeps a single oversized alert in its own message', () => {
  const big = 'x'.repeat(5000);
  const due = [{ key: 'k1', text: big }];
  const chunks = buildChunks(due, 'H', 'F', 4096);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].keys, ['k1']);
});

test('buildChunks each chunk has the footer appended', () => {
  const big = 'x'.repeat(2100);
  const due = [{ key: 'k1', text: big }, { key: 'k2', text: big }];
  const chunks = buildChunks(due, 'H', 'FOOTER', 4096);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].text.endsWith('<i>FOOTER</i>'));
  assert.ok(chunks[1].text.endsWith('<i>FOOTER</i>'));
});

test('buildChunks truncates an alert that alone would exceed maxLen', () => {
  const big = 'x'.repeat(5000);
  const due = [{ key: 'k1', text: big }];
  const chunks = buildChunks(due, 'H', 'F', 4096);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.length <= 4096, 'truncated to fit');
  assert.ok(chunks[0].text.includes('…'), 'ends with ellipsis marker');
});

test('buildChunks omits the header when it is an empty string', () => {
  const due = [{ key: 'k1', text: 'Alert' }];
  const chunks = buildChunks(due, '', 'Footer');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, 'Alert\n\n<i>Footer</i>');
});

test('stale tick does not record the holding action, so the alert fires on the next fresh tick', () => {
  const holdings = [{ code: 'AAA', shares: 1, value: 1, check: { action: 'review', reasons: [] } }];
  const staleTick = base({ holdings, sessionDate: null }); // null + tradingDay = stale
  const s = nextState(emptyState(), staleTick, [], [], '2026-11-19T04:00:00.000Z');
  assert.equal(s.actions.AAA ?? '', '', 'stale tick keeps action empty');
  const freshTick = base({ holdings, sessionDate: '2026-11-19' });
  assert.equal(decide(freshTick, s).due.some((a) => a.key.startsWith('pos:AAA')), true, 'fresh tick fires the alert');
});

test('a failed company list sets dataError only when the user has range rules', () => {
  assert.equal(alertsFor(base({ dataError: false }), {}).some((a) => a.key.startsWith('data-error:')), false);
  assert.equal(alertsFor(base({ dataError: true }), {}).some((a) => a.key.startsWith('data-error:')), true);
  assert.equal(alertsFor(base({ dataError: false, rangeRules: [{ id: 'r', kind: 'nearLow' as const, pct: 10, scope: 'all' as const }] }), {}).some((a) => a.key.startsWith('data-error:')), false, 'no data-error when dataError=false even with rules');
});

test('every alert line carries a company link', () => {
  const plans = [
    { id: 'p1', code: 'GP', until: null, targetPrice: 100, live: { status: 'reached', remaining: 1 } },
    { id: 'p2', code: 'BATBC', until: '2026-11-22', targetPrice: 300, live: { status: 'waiting', remaining: 2 } },
  ];
  const holdings = [
    { code: 'ROBI', shares: 1, value: 100, check: { action: 'review', reasons: [] } },
    { code: 'BRAC', shares: 1, value: 100, check: null },
  ];
  const rule = { id: 'r1', kind: 'nearLow' as const, pct: 10, scope: 'all' as const };
  const row = { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 };
  const alerts = alertsFor(base({
    plans, holdings,
    lastBuyDates: { BRAC: '2026-11-19' },
    rangeRules: [rule], rangeRows: [row],
    sessionDate: '2026-11-19',
  }), {});
  for (const a of alerts.filter((a) => !a.key.startsWith('data-error:'))) {
    assert.match(a.text, /https:\/\/dse-trade-helper\.vercel\.app\/c\//, `alert ${a.key} has no company link`);
  }
});

// --- price rules from /alerts reach Telegram ---

test('price rules: a reached target sends one Telegram alert with the plan note, escaped', () => {
  const rules = [
    { type: 'price_below' as const, id: 'pb', enabled: true, code: 'GP', target: 96, note: 'buy <5>' },
    { type: 'price_above' as const, id: 'pa', enabled: true, code: 'ROBI', target: 104 },
    { type: 'price_above' as const, id: 'off', enabled: false, code: 'ROBI', target: 1 },
    { type: 'big_move' as const, id: 'bm', enabled: true, code: 'GP', threshold: 0.1 },
  ];
  const livePriceRows = [{ code: 'GP', price: 95 }, { code: 'ROBI', price: 103 }];
  const a = alertsFor(base({ priceRules: rules, livePriceRows, sessionDate: '2026-11-19' }), {}).filter((x) => x.key.startsWith('price:'));
  assert.deepEqual(a.map((x) => x.key), ['price:pb:2026-11-19'], 'only the reached, enabled price rule; ROBI 103 < 104; big_move stays browser-only');
  assert.match(a[0].text, /GP price ৳95\.00 dropped to ৳96\.00 · your plan: buy &lt;5&gt;/);
  assert.match(a[0].text, /\/c\/GP$/);
});

test('price rules: nothing is sent from an old session price', () => {
  const rules = [{ type: 'price_below' as const, id: 'pb', enabled: true, code: 'GP', target: 96 }];
  const a = alertsFor(base({ priceRules: rules, livePriceRows: [{ code: 'GP', price: 95 }], sessionDate: '2026-11-18' }), {});
  assert.equal(a.some((x) => x.key.startsWith('price:')), false);
});

test('price rules: a stored close is not a live price, so it never fires', () => {
  const rules = [{ type: 'price_below' as const, id: 'pb', enabled: true, code: 'GP', target: 96 }];
  const rangeRows = [{ code: 'GP', price: 95, weekLow52: 80, weekHigh52: 300 }];
  const a = alertsFor(base({ priceRules: rules, rangeRows, livePriceRows: [], sessionDate: '2026-11-19' }), {});
  assert.equal(a.some((x) => x.key.startsWith('price:')), false, 'GP has not traded today');
});

test('nextState drops price keys from earlier days, keeps today and other keys', () => {
  const state = { ...emptyState(), sent: {
    'price:pb:2026-11-18': '2026-11-18T05:00:00.000Z', 'price:pb:2026-11-19': '2026-11-19T04:00:00.000Z', 'range:r1:2026-11-18': '2026-11-18T05:00:00.000Z',
  } };
  const next = nextState(state, base(), [], [], '2026-11-19T04:05:00.000Z');
  assert.deepEqual(Object.keys(next.sent).sort(), ['price:pb:2026-11-19', 'range:r1:2026-11-18']);
});

test('price rule "once": one key for good; kept across days while the rule exists or the Sheet is unreadable', () => {
  const once = { type: 'price_below' as const, id: 'o1', enabled: true, code: 'GP', target: 96, stop: 'once' as const };
  const a = alertsFor(base({ priceRules: [once], livePriceRows: [{ code: 'GP', price: 95 }], sessionDate: '2026-11-19' }), {});
  assert.deepEqual(a.filter((x) => x.key.startsWith('price')).map((x) => x.key), ['price-once:o1']);
  const old = { ...emptyState(), sent: { 'price-once:o1': '2026-09-01T04:00:00.000Z', 'price-once:gone': '2026-11-01T04:00:00.000Z' } };
  assert.deepEqual(Object.keys(nextState(old, base({ priceRules: [once] }), [], [], '2026-11-19T04:05:00.000Z').sent), ['price-once:o1'], 'old age kept, deleted rule dropped');
  assert.deepEqual(Object.keys(nextState(old, base(), [], [], '2026-11-19T04:05:00.000Z').sent).sort(), ['price-once:gone', 'price-once:o1'], 'unreadable Sheet keeps all');
});

test('price rule "once": turned off, its key goes, so turning it on again re-arms Telegram', () => {
  const off = { type: 'price_below' as const, id: 'o1', enabled: false, code: 'GP', target: 96, stop: 'once' as const };
  const state = { ...emptyState(), sent: { 'price-once:o1': '2026-11-18T04:00:00.000Z' } };
  assert.deepEqual(Object.keys(nextState(state, base({ priceRules: [off] }), [], [], '2026-11-19T04:05:00.000Z').sent), []);
});
