import fs from 'node:fs';
import path from 'node:path';
import { DHAKA_OFFSET_MS } from './dhaka.ts';
import { livePrices } from './dse.ts';
import { listPlans, picksFor } from './planner-service.ts';
import { companyDetail } from './service.ts';
import { escapeHtml, OFF_TEXT, sendMessage, telegramEnabled } from './telegram.ts';
import { listTrades } from './trades-service.ts';

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

export interface PlanRow { id: string; code: string; until: string | null; targetPrice: number | null; live: { status: string; remaining: number } }
export interface HoldingRow { code: string; shares: number; value: number | null; check: { action: string; reasons: string[] } | null }
export interface Pick3 { code: string; name: string; price: number }
export interface NotifyInput {
  clock: Clock;
  plans: PlanRow[];
  holdings: HoldingRow[];
  lastBuyDates: Record<string, string | null>;
  dayPl: number | null;
  picks: Pick3[];
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
}

export const emptyState = (): NotifyState => ({ sent: {}, actions: {}, lastRun: null, lastSent: null, pending: 0 });

const taka = (x: number) => `৳${x.toFixed(2)}`;
const whole = (x: number) => `${x < 0 ? '-' : ''}৳${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
const ALERT_ACTIONS: Record<string, string> = { review: 'Review — consider selling', 'take-profit': 'Take profit' };

export function alertsFor(input: NotifyInput, prevActions: Record<string, string>): Alert[] {
  const { clock } = input;
  const out: Alert[] = [];
  for (const p of input.plans) {
    const code = escapeHtml(p.code);
    if (p.live.status === 'reached' && p.targetPrice != null) {
      out.push({ key: `plan:${p.id}:reached:${clock.date}`, text: `<b>${code}</b> reached ${taka(p.targetPrice)} — your plan says buy the other ${p.live.remaining}` });
    }
    if ((p.live.status === 'reached' || p.live.status === 'waiting') && p.until === clock.tomorrow) {
      out.push({ key: `plan:${p.id}:expiring:${p.until}`, text: `Your <b>${code}</b> buy plan ends on the next trading day (${p.until}) — ${p.live.remaining} shares still to buy. Edit the date or cancel it.` });
    }
  }
  for (const h of input.holdings) {
    if (h.shares <= 0) continue;
    const code = escapeHtml(h.code);
    const action = h.check?.action ?? '';
    if (ALERT_ACTIONS[action] && prevActions[h.code] !== action) {
      const why = (h.check?.reasons ?? []).map((r) => `• ${escapeHtml(r)}`).join('\n');
      out.push({ key: `pos:${h.code}:${action}:${clock.date}`, code: h.code, text: `<b>${code}</b>: ${ALERT_ACTIONS[action]}\n${why}`.trim() });
    }
    const lastBuy = input.lastBuyDates[h.code];
    if (lastBuy === clock.date || lastBuy === clock.tomorrow) {
      out.push({ key: `div:${h.code}:${lastBuy}`, text: `<b>${code}</b>: ${lastBuy === clock.date ? 'today' : 'the next trading day'} (${lastBuy}) is the last day to buy for the dividend. To get it you must still hold the shares on the record date — check that date with your broker.` });
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
    `<b>DSE morning summary — ${input.clock.date}</b>`,
    held.length ? `Holdings: ${whole(value)}${input.dayPl == null ? '' : ` (today ${input.dayPl >= 0 ? '+' : ''}${whole(input.dayPl)})`}` : 'Holdings: none',
    `Buy plans: ${reached} reached, ${waiting} waiting`,
  ];
  if (input.picks.length) lines.push(`Picks to research: ${input.picks.map((p) => `${escapeHtml(p.code)} ${taka(p.price)}`).join(', ')}`);
  lines.push('<i>Learning aid, not investment advice.</i>');
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
  const actions = Object.fromEntries(input.holdings.filter((h) => h.shares > 0).map((h) => [h.code, blocked.has(h.code) ? state.actions[h.code] ?? '' : h.check?.action ?? '']));
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

async function gather(clock: Clock, budget: number | null | undefined): Promise<NotifyInput> {
  const [trades, plans, live] = await Promise.all([
    listTrades(),
    listPlans(),
    livePrices().catch((e: unknown) => { console.warn('notify: live prices unavailable', e); return {} as Record<string, { ltp: number; ycp: number }>; }),
  ]);
  const held = trades.holdings.filter((h) => h.shares > 0);
  const moves = held.map((h) => (live[h.code]?.ltp && live[h.code]?.ycp ? h.shares * (live[h.code].ltp - live[h.code].ycp) : null));
  const lastBuyDates = Object.fromEntries(await Promise.all(held.map(async (h) => {
    const d = await companyDetail(h.code, false).catch((e: unknown) => { console.warn(`notify: no detail for ${h.code}`, e); return null; });
    return [h.code, d?.dividend.upcoming?.lastBuyDate ?? null] as const;
  })));
  const picks = summaryDue(clock)
    ? await picksFor(new URLSearchParams(budget ? { budget: String(budget) } : {})).then((r) => r.picks.slice(0, 3)).catch((e: unknown) => { console.warn('notify: picks unavailable', e); return []; })
    : [];
  return {
    clock, plans: plans.plans, picks, lastBuyDates,
    holdings: held.map((h) => ({ code: h.code, shares: h.shares, value: h.value, check: h.check })),
    dayPl: moves.length && moves.every((m) => m != null) ? moves.reduce((a: number, m) => a + (m as number), 0) : null,
  };
}

export async function runNotifier(now = new Date()): Promise<{ sent: number; pending: number }> {
  const state = readState();
  let input: Awaited<ReturnType<typeof gather>>;
  try {
    input = await gather(dhakaClock(now), state.budget);
  } catch (e) {
    writeState({ ...state, lastError: { at: now.toISOString(), text: 'Could not read your plans or holdings. The next check tries again.' } });
    throw e;
  }
  const { due, held } = decide(input, state);
  const sentKeys: string[] = [];
  const unsent = [...held];
  for (const a of due) {
    if ((await sendMessage(a.text)).ok) sentKeys.push(a.key);
    else unsent.push(a);
  }
  writeState({ ...nextState(state, input, sentKeys, unsent, now.toISOString()), lastError: null });
  return { sent: sentKeys.length, pending: unsent.length };
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
