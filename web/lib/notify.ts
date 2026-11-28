import fs from 'node:fs';
import path from 'node:path';
import { DHAKA_OFFSET_MS } from './dhaka.ts';
import { livePrices, marketSession } from './dse.ts';
import { listPlans, picksFor } from './planner-service.ts';
import { rangeFeed, describeMatch, describeRule, rangeLooksWrong, rangeStats, type Owned, type RangeRow, type RangeRule } from './range.ts';
import type { CompanyRow } from './service.ts';
import { evaluateRules, type AlertRule } from './alerts.ts';

export const RANGE_DIGEST_MAX = 10;
import { listCompanies, companyDetail } from './service.ts';
import { escapeHtml, OFF_TEXT, sendMessage, telegramEnabled, type SendResult } from './telegram.ts';
import { listTrades, readPrefs } from './trades-service.ts';

const PRICE_RULE_TYPES = new Set(['price_above', 'price_below']);
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
  // The user's /alerts rules; only the price ones (at or above / at or below) go to Telegram.
  priceRules?: readonly AlertRule[];
  // Today's traded prices (ltp > 0) only, so an old close never fires a price rule.
  livePriceRows?: readonly { code: string; price: number }[];
  companies?: readonly CompanyRow[];
  medians?: Record<string, number | null>;
  watchlist: readonly string[];
  lastBuyDates: Record<string, string | null>;
  dayPl: number | null;
  picks: Pick3[];
  sessionDate?: string | null;
  dataTime?: string | null;
  dataError?: boolean;
  low52Enabled?: boolean;
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
  low52?: Record<string, number>;
}

// Every alert ends with this line, as the site does.
export const ALERT_FOOTER = 'Learning aid, not investment advice.';

export const emptyState = (): NotifyState => ({ sent: {}, actions: {}, lastRun: null, lastSent: null, pending: 0 });

const taka = (x: number) => `৳${x.toFixed(2)}`;
const whole = (x: number) => `${x < 0 ? '-' : ''}৳${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const ALERT_ACTIONS: Record<string, string> = { review: 'Review: stop-loss or a warning', 'take-profit': 'Above your target' };

const BANDS = [5, 10, 15, 20] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export function recDateLine(recordDate: string | null | undefined, today: string): string | null {
  if (!recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return null;
  const diff = Math.round((Date.parse(recordDate) - Date.parse(today)) / 86_400_000);
  if (!Number.isFinite(diff)) return null;
  const formatted = fmtDate(recordDate);
  if (diff > 1) return `Record date: ${formatted} (in ${diff} days)`;
  if (diff === 1) return `Record date: ${formatted} (tomorrow)`;
  if (diff === 0) return `Record date: ${formatted} (today)`;
  if (diff === -1) return `Record date: ${formatted} (passed, yesterday)`;
  return `Record date: ${formatted} (passed, ${Math.abs(diff)} days ago)`;
}

export function low52Bands(input: Pick<NotifyInput, 'watchlist' | 'owned' | 'rangeRows'>): Map<string, number> {
  const inScope = new Set([...input.watchlist, ...input.owned.filter((o) => o.shares > 0).map((o) => o.code)]);
  const rowMap = new Map(input.rangeRows.map((r) => [r.code, r]));
  const result = new Map<string, number>();
  for (const code of inScope) {
    const row = rowMap.get(code);
    if (!row || rangeLooksWrong(row)) continue;
    const stats = rangeStats(row);
    if (!stats) continue;
    if (stats.aboveLowPct < 0) { result.set(code, 5); continue; }
    for (const b of BANDS) {
      if (stats.aboveLowPct <= b) { result.set(code, b); break; }
    }
  }
  return result;
}

export function low52Verdict(band: number, signal: string | undefined, fraud: string | undefined, aboveLowPct: number, score: number | null | undefined): { emoji: '🟢' | '🟡' | '🔴'; reason: string } {
  if (signal === 'avoid' || fraud === 'high') return { emoji: '🔴', reason: 'high risk by these rules (warning signs or a loss)' };
  if (signal === 'research' && (band === 5 || band === 10) && fraud !== 'suspicious') {
    const scoreStr = score != null ? `good score (${score}), ` : '';
    return { emoji: '🟢', reason: `${scoreStr}passes all checks, ${aboveLowPct}% above its low` };
  }
  if (fraud === 'suspicious') return { emoji: '🟡', reason: 'near its low, but a warning sign was found' };
  if (signal === 'research') return { emoji: '🟡', reason: 'near its low but price has room to fall further' };
  if (signal === 'caution') return { emoji: '🟡', reason: 'caution signal near its low' };
  return { emoji: '🟡', reason: 'near its low, signal unclear' };
}

function buildLow52Block(code: string, band: number, pct: number, row: RangeRow | undefined, company: CompanyRow | undefined, today: string): string {
  const lines: string[] = [];
  const header = [`<b>${escapeHtml(code)}</b>`];
  if (company?.name) header.push(escapeHtml(company.name));
  if (company?.sector) header.push(escapeHtml(company.sector));
  lines.push(header.join(' · '));
  const v = low52Verdict(band, company?.signal, company?.fraud, pct, company?.score);
  const verdictLabel = v.emoji === '🟢' ? 'Green' : v.emoji === '🔴' ? 'Red' : 'Caution';
  lines.push(`${v.emoji} ${verdictLabel} — ${escapeHtml(v.reason)}`);
  lines.push(`📉 Within ${band}% of its 52-week low (${pct}% above it)`);
  const priceParts: string[] = [];
  if (row?.price != null) {
    const chg = company?.changePct != null ? ` (today ${company.changePct >= 0 ? '+' : '-'}${Math.abs(company.changePct).toFixed(1)}%)` : '';
    priceParts.push(`Price ${taka(row.price)}${chg}`);
  }
  if (row?.weekLow52 != null) priceParts.push(`Low ${taka(row.weekLow52)}`);
  if (row?.weekHigh52 != null) priceParts.push(`High ${taka(row.weekHigh52)}`);
  if (priceParts.length) lines.push(priceParts.join(' · '));
  const statParts: string[] = [];
  if (company?.score != null) statParts.push(`Score ${company.score}`);
  if (company?.signal) statParts.push(`Signal: ${escapeHtml(company.signal.charAt(0).toUpperCase() + company.signal.slice(1))}`);
  if (company?.pe != null) statParts.push(`P/E ${(company.pe as number).toFixed(1)}`);
  if (company?.dividendYield != null) statParts.push(`Yield ${(company.dividendYield as number).toFixed(1)}%`);
  if (statParts.length) lines.push(statParts.join(' · '));
  const divParts: string[] = [];
  if (company?.recordCashPerShare != null) {
    const cashPct = company.recordCashPct != null ? ` (${company.recordCashPct}%)` : '';
    divParts.push(`${taka(company.recordCashPerShare as number)} cash per share${cashPct}`);
  }
  if ((company?.recordStockPct as number | null | undefined) != null && ((company?.recordStockPct as number) > 0)) {
    divParts.push(`${company?.recordStockPct}% bonus`);
  }
  if (divParts.length) lines.push(`Dividend: ${divParts.join(' + ')}`);
  const rdLine = recDateLine(company?.recordDate, today);
  if (rdLine) lines.push(rdLine);
  if ((company?.fraud === 'suspicious' || company?.fraud === 'high') && (company?.flags as string[] | undefined)?.length) {
    lines.push(`⚠️ Warning signs: ${(company.flags as string[]).slice(0, 2).map((f) => escapeHtml(f.length > 80 ? f.slice(0, 79) + '…' : f)).join(', ')}`);
  }
  lines.push(`Open: ${SITE}/c/${encodeURIComponent(code)}`);
  return lines.join('\n');
}

function buildLow52Text(title: string, blocks: string[], totalMovers: number, maxLen: number): string {
  const moreLine = (n: number) => `\n…and ${n} more — Open: ${SITE}/range`;
  let result = title;
  for (let i = 0; i < blocks.length; i++) {
    const remaining = totalMovers - i - 1;
    const withBlock = result + '\n\n' + blocks[i];
    const candidate = remaining > 0 ? withBlock + moreLine(remaining) : withBlock;
    if (candidate.length > maxLen && i > 0) return result + moreLine(totalMovers - i);
    result = withBlock;
  }
  const extra = totalMovers - blocks.length;
  if (extra > 0) result += moreLine(extra);
  if (result.length > 4096) result = result.slice(0, 4090) + '…';
  return result;
}

export function alertsFor(input: NotifyInput, prevActions: Record<string, string>, prevLow52: Record<string, number> = {}): Alert[] {
  const { clock } = input;
  const out: Alert[] = [];
  // null = session fetch failed: stale on trading days (unknown freshness). undefined = not set by test: not stale.
  const isStale = input.sessionDate === null ? clock.tradingDay : input.sessionDate != null && input.sessionDate !== clock.date;

  if (input.dataError && clock.tradingDay) {
    out.push({ key: `data-error:${clock.date}`, text: `⚠️ <b>DSE data unavailable</b>\nToday's check could not read DSE data.\nAlerts may be missing.` });
  }

  for (const p of input.plans) {
    const code = escapeHtml(p.code);
    if (!isStale && p.live.status === 'reached' && p.targetPrice != null) {
      const priceLine = p.ltp != null ? `\nCurrent price: ${taka(p.ltp)}` : '';
      out.push({ key: `plan:${p.id}:reached:${clock.date}`, text: `🎯 <b>${code} reached your plan price</b>\nPlan price: ${taka(p.targetPrice)}${priceLine}\nShares left in your plan: ${p.live.remaining}\nOpen: ${SITE}/c/${encodeURIComponent(p.code)}` });
    }
    if ((p.live.status === 'reached' || p.live.status === 'waiting') && p.until === clock.tomorrow) {
      out.push({ key: `plan:${p.id}:expiring:${p.until}`, text: `📅 <b>Your ${code} buy plan expires next trading day</b>\nEnds on: ${p.until}\nShares still to buy: ${p.live.remaining}\nEdit the date or cancel it.\nOpen: ${SITE}/c/${encodeURIComponent(p.code)}` });
    }
  }
  for (const h of input.holdings) {
    if (h.shares <= 0) continue;
    const code = escapeHtml(h.code);
    const action = h.check?.action ?? '';
    if (!isStale && ALERT_ACTIONS[action] && prevActions[h.code] !== action) {
      const why = (h.check?.reasons ?? []).map((r) => `• ${escapeHtml(r)}`).join('\n');
      const actionLabel = action === 'review' ? 'Review' : 'Take profit';
      out.push({ key: `pos:${h.code}:${action}:${clock.date}`, code: h.code, text: `🔔 <b>${code} — ${actionLabel}</b>\n${ALERT_ACTIONS[action]}${why ? '\n' + why : ''}\nBased only on the limits you set.\nOpen: ${SITE}/c/${encodeURIComponent(h.code)}` });
    }
    const lastBuy = input.lastBuyDates[h.code];
    if (lastBuy === clock.date || lastBuy === clock.tomorrow) {
      const when = lastBuy === clock.date ? `Today (${lastBuy})` : `The next trading day (${lastBuy})`;
      out.push({ key: `div:${h.code}:${lastBuy}`, text: `💰 <b>Last day to buy: ${code}</b>\n${when} is the last day to buy for the dividend.\nIf the board's dividend is approved, hold until the record date to receive it.\nCheck the record date with your broker.\nOpen: ${SITE}/c/${encodeURIComponent(h.code)}` });
    }
  }
  const priceRules = (input.priceRules ?? []).filter((r) => PRICE_RULE_TYPES.has(r.type));
  if (!isStale && priceRules.length > 0) {
    // Same check and wording as the browser alert; the sent-key log keeps it to one message per rule per day.
    const snaps = (input.livePriceRows ?? []).map((r) => ({ code: r.code, price: r.price, changePct: null, flags: [] }));
    const onceIds = new Set(priceRules.filter((r) => 'stop' in r && r.stop === 'once').map((r) => r.id));
    for (const e of evaluateRules(priceRules, snaps, [], clock.date, {}).events) {
      // A "once" rule keeps one key for good, so Telegram sends it one time even if no browser turns it off.
      out.push({ key: onceIds.has(e.ruleId) ? `price-once:${e.ruleId}` : `price:${e.key}`, text: `${escapeHtml(e.message)}\nOpen: ${SITE}/c/${encodeURIComponent(e.code)}` });
    }
  }
  if (!isStale && input.rangeRules.length > 0) {
    const matches = rangeFeed(input.rangeRules, { rows: input.rangeRows, watchlist: input.watchlist, holdings: input.owned, companies: input.companies, medians: input.medians });
    const rowMap = new Map(input.rangeRows.map((r) => [r.code, r]));
    // One message per rule per day, listing the closest RANGE_DIGEST_MAX: a wide rule cannot flood the chat or the saved state.
    for (const rule of input.rangeRules) {
      const mine = matches.filter((m) => m.rule.id === rule.id);
      if (!mine.length) continue;
      const lines = mine.slice(0, RANGE_DIGEST_MAX).flatMap((m) => {
        const r = rowMap.get(m.code);
        const nums = r?.price != null && r.weekLow52 != null && r.weekHigh52 != null
          ? ` ${taka(r.price)} (low ${taka(r.weekLow52)}, high ${taka(r.weekHigh52)})`
          : '';
        return [`• <b>${escapeHtml(m.code)}</b>${nums}: ${describeMatch(m)}`, `Open: ${SITE}/c/${encodeURIComponent(m.code)}`];
      });
      if (mine.length > RANGE_DIGEST_MAX) lines.push(`…and ${mine.length - RANGE_DIGEST_MAX} more — Open: ${SITE}/range`);
      out.push({ key: `range:${rule.id}:${clock.date}`, text: [`📊 <b>Your 52-week rule</b>`, escapeHtml(describeRule(rule)), ...lines].join('\n') });
    }
  }
  if (!isStale && input.low52Enabled !== false) {
    const bands = low52Bands(input);
    const companyMap = new Map((input.companies ?? []).map((c) => [c.code, c]));
    const rowMap = new Map(input.rangeRows.map((r) => [r.code, r]));
    const movers = [...bands.entries()].filter(([code, band]) => band < (prevLow52[code] ?? 21));
    if (movers.length > 0) {
      const withStats = movers.map(([code, band]) => {
        const row = rowMap.get(code);
        const pct = row ? (rangeStats(row)?.aboveLowPct ?? 0) : 0;
        return { code, band, pct };
      });
      const verdictOrder: Record<string, number> = { '🟢': 0, '🟡': 1, '🔴': 2 };
      const withVerdicts = withStats.map(({ code, band, pct }) => {
        const c = companyMap.get(code);
        return { code, band, pct, verdict: low52Verdict(band, c?.signal, c?.fraud, pct, c?.score) };
      });
      withVerdicts.sort((a, b) => (verdictOrder[a.verdict.emoji] - verdictOrder[b.verdict.emoji]) || (a.pct - b.pct) || (a.code < b.code ? -1 : 1));
      let greenCount = 0, cautionCount = 0, redCount = 0;
      for (const { verdict } of withVerdicts) {
        if (verdict.emoji === '🟢') greenCount++;
        else if (verdict.emoji === '🟡') cautionCount++;
        else redCount++;
      }
      const countParts = ([greenCount > 0 ? `🟢 ${greenCount}` : null, cautionCount > 0 ? `🟡 ${cautionCount}` : null, redCount > 0 ? `🔴 ${redCount}` : null] as (string | null)[]).filter(Boolean).join(' · ');
      const title = `📉 <b>Near 52-week low</b> — ${countParts}`;
      const totalMovers = withVerdicts.length;
      const displayBlocks = withVerdicts.slice(0, RANGE_DIGEST_MAX).map(({ code, band, pct }) =>
        buildLow52Block(code, band, pct, rowMap.get(code), companyMap.get(code), clock.date)
      );
      const sortedPairs = movers.map(([c, b]) => `${c}=${b}`).sort().join(',');
      const key = `low52:${clock.date}:${sortedPairs}`;
      const text = buildLow52Text(title, displayBlocks, totalMovers, 3800);
      out.push({ key, text });
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
    `📋 <b>Morning summary (DSE data) — ${input.clock.date}</b>`,
    held.length ? `Holdings: ${whole(value)}${input.dayPl == null ? '' : ` (today ${input.dayPl >= 0 ? '+' : ''}${whole(input.dayPl)})`}` : 'Holdings: none',
    `Buy plans: ${reached} reached, ${waiting} waiting`,
  ];
  for (const p of input.picks) {
    lines.push(`Research: ${escapeHtml(p.code)} ${taka(p.price)} (${p.reason})`);
    lines.push(`Open: ${SITE}/c/${encodeURIComponent(p.code)}`);
  }
  return lines.join('\n');
}

// Everything due and not yet sent; quiet hours hold everything back (nothing here is urgent enough to wake the owner).
export function decide(input: NotifyInput, state: NotifyState): { due: Alert[]; held: Alert[] } {
  const all = alertsFor(input, state.actions, state.low52 ?? {});
  if (summaryDue(input.clock)) all.push({ key: `summary:${input.clock.date}`, text: summaryText(input) });
  const fresh = all.filter((a) => !state.sent[a.key]);
  return isQuiet(input.clock) ? { due: [], held: fresh } : { due: fresh, held: [] };
}

// Sent keys are recorded; a holding's action is remembered unless its alert is still unsent, so a failed send retries.
export function nextState(state: NotifyState, input: NotifyInput, sentKeys: string[], unsent: Alert[], nowIso: string): NotifyState {
  const cutoff = Date.parse(nowIso) - KEEP_KEYS_MS;
  // A price key only matters on its own day; dropping older ones keeps the saved state small (one Sheet cell).
  const oldPriceKey = (k: string) => k.startsWith('price:') && !k.endsWith(`:${input.clock.date}`);
  // "Once" keys never age out while their rule exists, and go when the rule is deleted (at most 100).
  // Unreadable Sheet (undefined) keeps all "once" keys; a disabled rule loses its key, so re-enabling re-arms it.
  const ruleIds = input.priceRules ? new Set(input.priceRules.filter((r) => r.enabled).map((r) => r.id)) : null;
  const keep = ([k, at]: [string, string]) => k.startsWith('price-once:') ? !ruleIds || ruleIds.has(k.slice('price-once:'.length)) : Date.parse(at) >= cutoff && !oldPriceKey(k);
  const sent = Object.fromEntries(Object.entries(state.sent).filter(keep));
  for (const k of sentKeys) sent[k] = nowIso;
  const blocked = new Set(unsent.map((a) => a.code).filter(Boolean));
  const isStale = input.sessionDate === null ? input.clock.tradingDay : input.sessionDate != null && input.sessionDate !== input.clock.date;
  const actions = Object.fromEntries(input.holdings.filter((h) => h.shares > 0).map((h) => [h.code, isStale || blocked.has(h.code) ? state.actions[h.code] ?? '' : h.check?.action ?? '']));
  const low52Enabled = input.low52Enabled !== false;
  const bandsMap = low52Enabled ? low52Bands(input) : new Map<string, number>();
  const inScope = new Set([...input.watchlist, ...input.owned.filter((o) => o.shares > 0).map((o) => o.code)]);
  const prevLow52 = state.low52 ?? {};
  const movers = [...bandsMap.entries()].filter(([code, band]) => band < (prevLow52[code] ?? 21));
  const low52Key = movers.length > 0 ? `low52:${input.clock.date}:${movers.map(([c, b]) => `${c}=${b}`).sort().join(',')}` : null;
  const alertSent = low52Key ? sentKeys.includes(low52Key) : false;
  const low52: Record<string, number> = low52Enabled ? { ...prevLow52 } : {};
  if (alertSent) {
    for (const [code, band] of movers) low52[code] = band;
  }
  if (low52Enabled) {
    const rowMap = new Map(input.rangeRows.map((r) => [r.code, r]));
    for (const code of Object.keys(low52)) {
      if (!inScope.has(code)) { delete low52[code]; continue; }
      const row = rowMap.get(code);
      if (row && !rangeLooksWrong(row)) {
        const stats = rangeStats(row);
        if (stats && stats.aboveLowPct > 20) delete low52[code];
      }
    }
  }
  return { ...state, sent, actions, low52, lastRun: nowIso, lastSent: sentKeys.length ? nowIso : state.lastSent, pending: unsent.length };
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
  const priceRules = prefs ? (prefs.alertRules ?? []).filter((r) => PRICE_RULE_TYPES.has(r.type)) : undefined;
  // Price rules read live prices (livePriceError), not the company list.
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
    priceRules,
    livePriceRows: Object.entries(live).filter(([, v]) => v.ltp > 0).map(([code, v]) => ({ code, price: v.ltp })),
    rangeRows: companyResult?.rows ?? [],
    companies: companyResult?.rows ?? [],
    medians: companyResult?.medians,
    watchlist: prefs?.watchlist ?? [],
    dayPl: moves.length && moves.every((m) => m != null) ? moves.reduce((a: number, m) => a + (m as number), 0) : null,
    sessionDate: session?.sessionDate ?? null,
    dataTime: session?.dataTime ?? null,
    dataError,
    low52Enabled: prefs?.low52Alerts !== false,
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
