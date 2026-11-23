import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { alertsFor, decide, dhakaClock, emptyState, inMarketWindow, isQuiet, nextState, readState, summaryDue, summaryText, writeState, type NotifyInput } from '../lib/notify.ts';
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

test('a reached buy plan says what to buy; a plan ending on the next trading day warns once', () => {
  const plans = [
    { id: 'p1', code: 'GP', until: null, targetPrice: 222.2, live: { status: 'reached', remaining: 5 } },
    { id: 'p2', code: 'BATBC', until: '2026-11-22', targetPrice: 300, live: { status: 'waiting', remaining: 3 } },
    { id: 'p3', code: 'X', until: '2026-11-22', targetPrice: 1, live: { status: 'cancelled', remaining: 3 } },
  ];
  const a = alertsFor(base({ plans }), {});
  assert.deepEqual(a.map((x) => x.key), ['plan:p1:reached:2026-11-19', 'plan:p2:expiring:2026-11-22']);
  assert.equal(a[0].text, '<b>GP</b> reached your plan price; 5 shares left in your plan');
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

test('the morning summary: holdings value, day P/L, plans and top picks, escaped', () => {
  const s = summaryText(base({
    clock: THU_0945, dayPl: -1234.4,
    holdings: [{ code: 'A', shares: 1, value: 12345.6, check: null }],
    plans: [{ id: '1', code: 'A', until: null, targetPrice: 1, live: { status: 'reached', remaining: 1 } }, { id: '2', code: 'B', until: null, targetPrice: 1, live: { status: 'waiting', remaining: 1 } }],
    picks: [{ code: 'A&B', name: 'x', price: 10 }],
  }));
  assert.equal(s, '<b>Morning summary (DSE data) — 2026-11-19</b>\nHoldings: ৳12,346 (today -৳1,234)\nBuy plans: 1 reached, 1 waiting\nResearch list: A&amp;B ৳10.00\n<i>Learning aid, not investment advice.</i>');
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

test('range rule matches go out as one message per rule, naming the rule and each company', () => {
  const rule = { id: 'nr1', kind: 'nearLow' as const, pct: 10, scope: 'all' as const };
  const row = { code: 'GP', price: 220, weekLow52: 200, weekHigh52: 300 };
  const a = alertsFor(base({ rangeRules: [rule], rangeRows: [row], owned: [] }), {});
  assert.deepEqual(a.map((x) => x.key), ['range:nr1:2026-11-19']);
  assert.equal(a[0].text, '<b>Your rule:</b> within 10% of the 52-week low (all companies)\n• <b>GP</b>: 10% above its 52-week low');
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
  // ROBI price 30 is ~7% above its 52-week low of 28 (matches pct=10); GP is not in owned so it is excluded
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
