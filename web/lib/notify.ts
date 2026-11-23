import fs from 'node:fs';
import path from 'node:path';
import { DHAKA_OFFSET_MS } from './dhaka.ts';
import { livePrices, marketSession } from './dse.ts';
import { listPlans, picksFor } from './planner-service.ts';
import { rangeFeed, describeMatch, describeRule, type Owned, type RangeRow, type RangeRule } from './range.ts';
import type { CompanyRow } from './service.ts';

export const RANGE_DIGEST_MAX = 10;
import { listCompanies, companyDetail } from './service.ts';
import { escapeHtml, OFF_TEXT, sendMessage, telegramEnabled, type SendResult } from './telegram.ts';
import { listTrades, readPrefs } from './trades-service.ts';

export const SITE = process.env.SITE_URL ?? 'https://dse-trade-helper.vercel.app';
const TICK_MS = 5 * 60_000;
const OPEN = 9 * 60 + 30, SUMMARY_AT = 9 * 60 + 45, CLOSE = 15 * 60;
const QUIET_FROM = 22 * 60, QUIET_UNTIL = 8 * 60;
const KEEP_KEYS_MS = 30 * 86_400_000;
const STATE_FILE = () => path.join(process.cwd(), 'data', 'notify-state.json');

export interface Clock { date: string; /** next trading day */ tomorrow: string; minutes: number; tradingDay: boolean }

// DSE trades Sunday to Thursday, so after Thursday the next trading day is Sunday; no holiday list.
function nextTradingDay(d: Date): string {
  let t = +d + 86_400_000;
  while ([5, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function dhakaClock(now: Date | number): Clock {
  const d = new Date(+now + DHAKA_OFFSET_MS);
  const day = d.getUTCDay();
  return {
    date: d.toISOString().slice(0, 10),
    tomorrow: nextTradingDay(d),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    tradingDay: day !== 5 && day !== 6, // DSE trades Sunday to Thursday; no holiday list
  };
}

export const isQuiet = (c: Clock): boolean => c.minutes >= QUIET_FROM || c.minutes < QUIET_UNTIL;
export const inMarketWindow = (c: Clock): boolean => c.tradingDay && c.minutes >= OPEN && c.minutes < CLOSE;
export const summaryDue = (c: Clock): boolean => c.tradingDay && c.minutes >= SUMMARY_AT && c.minutes < CLOSE;

export interface PlanRow { id: string; code: string; until: string | null; targetPrice: number | null; ltp?: number; live: { status: string; remaining: number } }
export interface HoldingRow { code: string; shares: number; value: number | null; check: { action: string; reasons: string[] } | null }
export interface Pick3 { code: string; name: string; price: number; reason: string }
export interface NotifyInput {
  clock: Clock;
  plans: PlanRow[];
  holdings: HoldingRow[];
  owned: readonly Owned[];
  rangeRules: readonly RangeRule[];
  rangeRows: readonly RangeRow[];
  companies?: readonly CompanyRow[];
  medians?: Record<string, number | null>;
  watchlist: readonly string[];
  lastBuyDates: Record<string, string | null>;
  dayPl: number | null;
  picks: Pick3[];
  sessionDate?: string | null;
  dataTime?: string | null;
  dataError?: boolean;
}
export interface Alert { key: string; text: string; code?: string }
export interface NotifyState {
  sent: Record<string, string>;
  actions: Record<string, string>;
  budget?: number | null;
  lastRun: string | null;
  lastSent: string | null;
  pending: number;
  lastError?: { at: string; text: string } | null;
  // Per-user alerts: when the user was told their Google sign-in ended.
  signInAsked?: string;
}

// Every alert ends with this line, as the site does.
export const ALERT_FOOTER = 'Learning aid, not investment advice.';

export const emptyState = (): NotifyState => ({ sent: {}, actions: {}, lastRun: null, lastSent: null, pending: 0 });

const taka = (x: number) => `৳${x.toFixed(2)}`;
const whole = (x: number) => `${x < 0 ? '-' : ''}৳${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const ALERT_ACTIONS: Record<string, string> = { review: 'Review: stop-loss or a warning', 'take-profit': 'Above your target' };

export function alertsFor(input: NotifyInput, prevActions: Record<string, string>): Alert[] {
  const { clock } = input;
  const out: Alert[] = [];
  // null = session fetch failed: stale on trading days (unknown freshness). undefined = not set by test: not stale.
  const isStale = input.sessionDate === null ? clock.tradingDay : input.sessionDate != null && input.sessionDate !== clock.date;

  if (input.dataError && clock.tradingDay) {
    out.push({ key: `data-error:${clock.date}`, text: "Today's check could not read DSE data; alerts may be missing." });
  }

  for (const p of input.plans) {
    const code = escapeHtml(p.code);
    if (!isStale && p.live.status === 'reached' && p.targetPrice != null) {
      const priceInfo = p.ltp != null ? `; current price ${taka(p.ltp)}` : '';
      out.push({ key: `plan:${p.id}:reached:${clock.date}`, text: `<b>${code}</b> reached your plan price ${taka(p.targetPrice)}${priceInfo}; ${p.live.remaining} shares left in your plan — ${SITE}/c/${encodeURIComponent(p.code)}` });
    }
    if ((p.live.status === 'reached' || p.live.status === 'waiting') && p.until === clock.tomorrow) {
      out.push({ key: `plan:${p.id}:expiring:${p.until}`, text: `Your <b>${code}</b> buy plan ends on the next trading day (${p.until}) — ${p.live.remaining} shares still to buy. Edit the date or cancel it. ${SITE}/c/${encodeURIComponent(p.code)}` });
    }
  }
  for (const h of input.holdings) {
    if (h.shares <= 0) continue;
    const code = escapeHtml(h.code);
    const action = h.check?.action ?? '';
    if (!isStale && ALERT_ACTIONS[action] && prevActions[h.code] !== action) {
      const why = (h.check?.reasons ?? []).map((r) => `• ${escapeHtml(r)}`).join('\n');
      out.push({ key: `pos:${h.code}:${action}:${clock.date}`, code: h.code, text: `<b>${code}</b>: ${ALERT_ACTIONS[action]}\n${why}\nBased only on the limits you set. — ${SITE}/c/${encodeURIComponent(h.code)}`.trim() });
    }
    const lastBuy = input.lastBuyDates[h.code];
    if (lastBuy === clock.date || lastBuy === clock.tomorrow) {
      out.push({ key: `div:${h.code}:${lastBuy}`, text: `<b>${code}</b>: ${lastBuy === clock.date ? 'today' : 'the next trading day'} (${lastBuy}) is the last day to buy for the dividend. If the board's dividend is approved, you must still hold the shares on the record date to get it — check that date with your broker. ${SITE}/c/${encodeURIComponent(h.code)}` });
    }
  }
  if (!isStale && input.rangeRules.length > 0) {
    const matches = rangeFeed(input.rangeRules, { rows: input.rangeRows, watchlist: input.watchlist, holdings: input.owned, companies: input.companies, medians: input.medians });
    const rowMap = new Map(input.rangeRows.map((r) => [r.code, r]));
    // One message per rule per day, listing the closest RANGE_DIGEST_MAX: a wide rule cannot flood the chat or the saved state.
    for (const rule of input.rangeRules) {
      const mine = matches.filter((m) => m.rule.id === rule.id);
      if (!mine.length) continue;
      const lines = mine.slice(0, RANGE_DIGEST_MAX).map((m) => {
        const r = rowMap.get(m.code);
        const nums = r?.price != null && r.weekLow52 != null && r.weekHigh52 != null
          ? ` ${taka(r.price)} (low ${taka(r.weekLow52)}, high ${taka(r.weekHigh52)})`
          : '';
        return `• <b>${escapeHtml(m.code)}</b>${nums}: ${describeMatch(m)} — ${SITE}/c/${encodeURIComponent(m.code)}`;
      });
      if (mine.length > RANGE_DIGEST_MAX) lines.push(`…and ${mine.length - RANGE_DIGEST_MAX} more on the 52-week range page`);
      out.push({ key: `range:${rule.id}:${clock.date}`, text: [`<b>Your rule:</b> ${escapeHtml(describeRule(rule))}`, ...lines].join('\n') });
    }
  }
  return out;
}

export function summaryText(input: NotifyInput): string {
  const held = input.holdings.filter((h) => h.shares > 0);
  const value = held.reduce((a, h) => a + (h.value ?? 0), 0);
  const reached = input.plans.filter((p) => p.live.status === 'reached').length;
  const waiting = input.plans.filter((p) => p.live.status === 'waiting').length;
  const lines = [
    `<b>Morning summary (DSE data) — ${input.clock.date}</b>`,
    held.length ? `Holdings: ${whole(value)}${input.dayPl == null ? '' : ` (today ${input.dayPl >= 0 ? '+' : ''}${whole(input.dayPl)})`}` : 'Holdings: none',
    `Buy plans: ${reached} reached, ${waiting} waiting`,
  ];
  if (input.picks.length) lines.push(`Research list: ${input.picks.map((p) => `${escapeHtml(p.code)} ${taka(p.price)} (${p.reason}) — ${SITE}/c/${encodeURIComponent(p.code)}`).join(', ')}`);
  return lines.join('\n');
}

// Everything due and not yet sent; quiet hours hold everything back (nothing here is urgent enough to wake the owner).
export function decide(input: NotifyInput, state: NotifyState): { due: Alert[]; held: Alert[] } {
  const all = alertsFor(input, state.actions);
  if (summaryDue(input.clock)) all.push({ key: `summary:${input.clock.date}`, text: summaryText(input) });
  const fresh = all.filter((a) => !state.sent[a.key]);
  return isQuiet(input.clock) ? { due: [], held: fresh } : { due: fresh, held: [] };
}

// Sent keys are recorded; a holding's action is remembered unless its alert is still unsent, so a failed send retries.
export function nextState(state: NotifyState, input: NotifyInput, sentKeys: string[], unsent: Alert[], nowIso: string): NotifyState {
  const cutoff = Date.parse(nowIso) - KEEP_KEYS_MS;
  const sent = Object.fromEntries(Object.entries(state.sent).filter(([, at]) => Date.parse(at) >= cutoff));
  for (const k of sentKeys) sent[k] = nowIso;
  const blocked = new Set(unsent.map((a) => a.code).filter(Boolean));
  const isStale = input.sessionDate === null ? input.clock.tradingDay : input.sessionDate != null && input.sessionDate !== input.clock.date;
  const actions = Object.fromEntries(input.holdings.filter((h) => h.shares > 0).map((h) => [h.code, isStale || blocked.has(h.code) ? state.actions[h.code] ?? '' : h.check?.action ?? '']));
  return { ...state, sent, actions, lastRun: nowIso, lastSent: sentKeys.length ? nowIso : state.lastSent, pending: unsent.length };
}

export function readState(file = STATE_FILE()): NotifyState {
  try { return { ...emptyState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('notify: state file unreadable, starting fresh', e);
    return emptyState();
  }
}

export function writeState(state: NotifyState, file = STATE_FILE()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(state));
  fs.renameSync(file + '.tmp', file);
}

// Packs alerts into Telegram messages ≤ maxLen chars, splitting on alert boundaries.
export function buildChunks(due: Alert[], header: string, footer: string, maxLen = 4096): Array<{ text: string; keys: string[] }> {
  if (!due.length) return [];
  const ft = `<i>${footer}</i>`;
  const join = (...segs: string[]) => segs.filter(Boolean).join('\n\n');
  const fitText = (text: string): string => {
    const alone = join(header, text, ft);
    if (alone.length <= maxLen) return text;
    const room = maxLen - (alone.length - text.length) - 1;
    return room < 1 ? text[0] + '…' : text.slice(0, room) + '…';
  };
  const chunks: Array<{ text: string; keys: string[] }> = [];
  let parts: string[] = header ? [header] : [];
  let keys: string[] = [];
  for (const a of due) {
    const body = fitText(a.text);
    if ([...parts, body, ft].filter(Boolean).join('\n\n').length > maxLen && keys.length > 0) {
      chunks.push({ text: join(...parts, ft), keys });
      parts = header ? [header] : [];
      keys = [];
    }
    parts.push(body);
    keys.push(a.key);
  }
  if (keys.length > 0) chunks.push({ text: join(...parts, ft), keys });
  return chunks;
}

function pickReason(p: { position52: number | null; vsSma20Pct: number | null }): string {
  const inLowerHalf = p.position52 != null && p.position52 <= 0.5;
  const belowSma = p.vsSma20Pct != null && p.vsSma20Pct <= -1;
  if (inLowerHalf && belowSma) return 'lower half of its range, below its 20-day average';
  if (inLowerHalf) return 'lower half of its 52-week range';
  return 'below its 20-day average';
}

async function gather(clock: Clock, budget: number | null | undefined): Promise<NotifyInput> {
  let livePriceError = false, sessionError = false, companyError = false;
  const [trades, plans, live, session, companyResult, prefs] = await Promise.all([
    listTrades(),
    listPlans(),
    livePrices().catch((e: unknown) => { console.warn('notify: live prices unavailable', e); livePriceError = true; return {} as Record<string, { ltp: number; ycp: number }>; }),
    marketSession().catch((e: unknown) => { console.warn('notify: market session unavailable', e); sessionError = true; return null; }),
    listCompanies().catch((e: unknown) => { console.warn('notify: company list unavailable for range rules', e); companyError = true; return null; }),
    readPrefs().catch((e: unknown) => { console.warn('notify: prefs unavailable for range rules', e); return null; }),
  ]);
  const held = trades.holdings.filter((h) => h.shares > 0);
  const moves = held.map((h) => (live[h.code]?.ltp && live[h.code]?.ycp ? h.shares * (live[h.code].ltp - live[h.code].ycp) : null));
  const lastBuyDates = Object.fromEntries(await Promise.all(held.map(async (h) => {
    const d = await companyDetail(h.code, false).catch((e: unknown) => { console.warn(`notify: no detail for ${h.code}`, e); return null; });
    return [h.code, d?.dividend.upcoming?.lastBuyDate ?? null] as const;
  })));
  const rangeRules = prefs?.rangeRules ?? [];
  const dataError = livePriceError || sessionError || (companyError && rangeRules.length > 0);
  const picks = summaryDue(clock)
    ? await picksFor(new URLSearchParams(budget ? { budget: String(budget) } : {})).then((r) => r.picks.slice(0, 3).map((p) => ({ code: p.code, name: p.name, price: p.price, reason: pickReason(p) }))).catch((e: unknown) => { console.warn('notify: picks unavailable', e); return [] as Pick3[]; })
    : [];
  return {
    clock, picks, lastBuyDates,
    plans: plans.plans.map((p) => ({ ...p, ltp: live[p.code]?.ltp })),
    holdings: held.map((h) => ({ code: h.code, shares: h.shares, value: h.value, check: h.check })),
    owned: held.map((h) => ({ code: h.code, shares: h.shares, avgCost: h.avgCost })),
    rangeRules,
    rangeRows: companyResult?.rows ?? [],
    companies: companyResult?.rows ?? [],
    medians: companyResult?.medians,
    watchlist: prefs?.watchlist ?? [],
    dayPl: moves.length && moves.every((m) => m != null) ? moves.reduce((a: number, m) => a + (m as number), 0) : null,
    sessionDate: session?.sessionDate ?? null,
    dataTime: session?.dataTime ?? null,
    dataError,
  };
}

// One alert check for whichever Sheet is active (owner's, or a user's inside withSheet); the caller keeps the state.
export async function checkOnce(state: NotifyState, send: (text: string) => Promise<SendResult>, now = new Date()): Promise<{ state: NotifyState; sent: number; pending: number }> {
  let input: Awaited<ReturnType<typeof gather>>;
  try {
    input = await gather(dhakaClock(now), state.budget);
  } catch (e) {
    throw Object.assign(e as Error, { state: { ...state, lastError: { at: now.toISOString(), text: 'Could not read your plans or holdings. The next check tries again.' } } });
  }
  const { due, held } = decide(input, state);
  const hasRealData = due.some((a) => !a.key.startsWith('data-error:'));
  const header = hasRealData ? (input.dataTime != null ? `Prices as of ${escapeHtml(input.dataTime)}` : `Checked at ${hhmm(input.clock.minutes)}`) : '';
  const chunks = buildChunks(due, header, ALERT_FOOTER);
  const sentKeys: string[] = [];
  const unsent = [...held];
  const alertsByKey = new Map(due.map((a) => [a.key, a]));
  for (const chunk of chunks) {
    if ((await send(chunk.text)).ok) sentKeys.push(...chunk.keys);
    else {
      for (const k of chunk.keys) {
        const a = alertsByKey.get(k);
        if (a) unsent.push(a);
      }
    }
  }
  return { state: { ...nextState(state, input, sentKeys, unsent, now.toISOString()), lastError: null }, sent: sentKeys.length, pending: unsent.length };
}

export async function runNotifier(now = new Date()): Promise<{ sent: number; pending: number }> {
  try {
    const r = await checkOnce(readState(), (text) => sendMessage(text), now);
    writeState(r.state);
    return { sent: r.sent, pending: r.pending };
  } catch (e) {
    const failed = (e as { state?: NotifyState }).state;
    if (failed) writeState(failed);
    throw e;
  }
}

export function notifyStatus() {
  const s = readState();
  return { enabled: telegramEnabled(), ...(telegramEnabled() ? {} : { message: OFF_TEXT }), lastRun: s.lastRun, lastSent: s.lastSent, pending: s.pending, lastError: s.lastError ?? null };
}

const timers = globalThis as { dseNotifier?: ReturnType<typeof setInterval> };
let running = false;

// Called once by instrumentation; the global guard keeps dev hot reload from starting a second timer.
export function startNotifier(): void {
  if (timers.dseNotifier) return;
  if (!telegramEnabled()) { console.warn(`notify: ${OFF_TEXT}`); return; }
  // Set on the laptop once .github/workflows/notify.yml sends the alerts, so the same alert is not sent twice.
  if (process.env.TELEGRAM_SCHEDULE === 'github') { console.warn('notify: the GitHub Action sends the alerts; this server only answers the test button'); return; }
  timers.dseNotifier = setInterval(() => {
    if (running || !inMarketWindow(dhakaClock(Date.now()))) return;
    running = true;
    runNotifier().catch((e: unknown) => console.error('notify: run failed', e)).finally(() => { running = false; });
  }, TICK_MS);
  timers.dseNotifier.unref?.();
}
