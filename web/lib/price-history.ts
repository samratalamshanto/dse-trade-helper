import type { Declaration, SeriesPoint } from './types.ts';

// A move counts as a rise or a fall once the close turns by at least this much from the last turning point.
export const SWING_MIN_PCT = 10;
export const SWING_SMALL_PCT = 5;
export const WINDOW_DAYS = 365;
const TOP_DAYS = 5;
const DAY_MS = 86_400_000;
const DEFAULT_FACE_VALUE = 10;
const FRIDAY = 5, SATURDAY = 6;

// Move % fields are dividend- and bonus-adjusted, changePct is the raw 1-year change; price fields stay raw like the daily table.
export interface MonthRow { month: string; open: number; close: number; high: number; low: number; changePct: number; avgVolume: number; trades: number | null; days: number; partial: boolean }
export interface Swing { kind: 'rise' | 'fall'; from: string; to: string; fromPrice: number; toPrice: number; pct: number; days: number }
export interface DayMove { date: string; close: number; pct: number; volume: number }
export interface Streak { kind: 'up' | 'down'; from: string; to: string; days: number; pct: number }
export interface ExDate { date: string; recordDate: string; cashPct: number | null; stockPct: number | null }
export interface PriceHistory {
  // totalReturnPct adds the cash dividends whose record date falls inside the 1-year window (dividendCash, ৳ a share).
  from: string; to: string; days: number; changePct: number | null; dividendCash: number; totalReturnPct: number | null;
  high: { date: string; price: number }; low: { date: string; price: number };
  // Highest daily high and lowest daily low (intraday), when DSE sends them; else the close.
  dayHigh: { date: string; price: number }; dayLow: { date: string; price: number };
  months: MonthRow[]; swings: Swing[]; swingsSmall: Swing[]; bestDays: DayMove[]; worstDays: DayMove[];
  longestUp: Streak | null; longestDown: Streak | null; upDays: number; downDays: number;
  sinceJan: number | null; exDates: ExDate[]; noTradeDays: number; lastTradeDate: string | null; illiquid: boolean;
}

// p: adjusted close used for every % figure; raw: the point as traded.
interface Adj { date: string; p: number; raw: SeriesPoint }

const pct = (from: number, to: number) => ((to - from) / from) * 100;
// An unreadable date gives '' (every point counts as inside the window, none as a year old).
const daysBefore = (iso: string, n: number): string => { const t = Date.parse(iso + 'T00:00:00Z') - n * DAY_MS; return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
// A day with no volume and no trades (a record-date suspension, an untraded share) is not a trading day.
export const traded = (p: SeriesPoint): boolean => !(p.volume === 0 && p.trades === 0);
const top = (p: SeriesPoint) => (p.high && p.high > 0 ? p.high : p.price);
const bottom = (p: SeriesPoint) => (p.low && p.low > 0 ? p.low : p.price);

// The last close on or before `date − 365 days`; null when the series does not reach back a year.
export function yearAgoClose(series: readonly SeriesPoint[]): SeriesPoint | null {
  const last = series.at(-1);
  if (!last) return null;
  const cut = daysBefore(last.date, WINDOW_DAYS);
  for (let i = series.length - 1; i >= 0; i--) if (series[i].date <= cut) return series[i];
  return null;
}

// The one 1-year change (lists, company page, notes): price now against the close a year back; none without trades in the window.
export function oneYearChange(series: readonly SeriesPoint[], priceNow: number | null | undefined): { pct: number; yearAgo: SeriesPoint } | null {
  const valid = series.filter((p) => Number.isFinite(p.price) && p.price > 0);
  const yearAgo = yearAgoClose(valid);
  if (!yearAgo || !priceNow || !(priceNow > 0) || !lastYearOf(valid).some(traded)) return null;
  return { pct: pct(yearAgo.price, priceNow), yearAgo };
}

// Cash a share from dividends whose record date is after `from` and on or before `to`; one per record date.
export function cashInWindow(declarations: readonly Declaration[], from: string, to: string, faceValue: number | null): number {
  const face = faceValue || DEFAULT_FACE_VALUE, seen = new Set<string>();
  let cash = 0;
  for (const d of declarations) {
    if (d.noDividend || !d.recordDate || !((d.cashPct ?? 0) > 0) || d.recordDate <= from || d.recordDate > to || seen.has(d.recordDate)) continue;
    seen.add(d.recordDate);
    cash += (d.cashPct! / 100) * face;
  }
  return Math.round(cash * 100) / 100;
}

// The points within 365 days of the last date: the one "52 weeks" window.
export function lastYearOf<T extends SeriesPoint>(series: readonly T[]): T[] {
  const last = series.at(-1);
  if (!last) return [];
  const start = daysBefore(last.date, WINDOW_DAYS);
  return series.filter((p) => p.date >= start);
}

// True when DSE could have traded (Sunday to Thursday) before / after `iso` in the same month; no holiday list.
function monthCutShort(iso: string, step: 1 | -1): boolean {
  const d = new Date(iso + 'T00:00:00Z'), month = d.getUTCMonth();
  for (d.setUTCDate(d.getUTCDate() + step); d.getUTCMonth() === month; d.setUTCDate(d.getUTCDate() + step)) {
    if (d.getUTCDay() !== FRIDAY && d.getUTCDay() !== SATURDAY) return true;
  }
  return false;
}

function monthRows(s: Adj[]): MonthRow[] {
  const groups = new Map<string, Adj[]>();
  for (const p of s) { const k = p.date.slice(0, 7); groups.set(k, [...(groups.get(k) ?? []), p]); }
  let prevClose: number | null = null;
  return [...groups].map(([month, pts], i) => {
    const close = pts.at(-1)!.p;
    const base = prevClose ?? (pts[0].raw.open ?? pts[0].raw.price) * (pts[0].p / pts[0].raw.price);
    prevClose = close;
    const trades = pts.every((p) => p.raw.trades == null) ? null : pts.reduce((a, p) => a + (p.raw.trades ?? 0), 0);
    const partial = (i === 0 && monthCutShort(pts[0].date, -1)) || (i === groups.size - 1 && monthCutShort(pts.at(-1)!.date, 1));
    return {
      month, open: pts[0].raw.open ?? pts[0].raw.price, close: pts.at(-1)!.raw.price, days: pts.length, trades, partial,
      high: Math.max(...pts.map((p) => top(p.raw))), low: Math.min(...pts.map((p) => bottom(p.raw))),
      changePct: pct(base, close), avgVolume: pts.reduce((a, p) => a + (p.raw.volume || 0), 0) / pts.length,
    };
  });
}

// Zigzag on closes: a turn of `minPct` or more from the running extreme ends one swing and starts the next.
function swings(s: Adj[], minPct: number): Swing[] {
  const out: Swing[] = [];
  const push = (a: number, b: number, kind: Swing['kind']) =>
    out.push({ kind, from: s[a].date, to: s[b].date, fromPrice: s[a].raw.price, toPrice: s[b].raw.price, pct: pct(s[a].p, s[b].p), days: b - a });
  // Before the first swing: watch the lowest and highest close so far; the first move of minPct away from one sets the direction.
  let lo = 0, hi = 0, i = 1, dir: Swing['kind'] | null = null, pivot = 0, extreme = 0;
  for (; i < s.length && !dir; i++) {
    if (s[i].p < s[lo].p) lo = i;
    if (s[i].p > s[hi].p) hi = i;
    if (pct(s[lo].p, s[i].p) >= minPct) { dir = 'rise'; pivot = lo; extreme = i; }
    else if (pct(s[hi].p, s[i].p) <= -minPct) { dir = 'fall'; pivot = hi; extreme = i; }
  }
  if (!dir) return out;
  for (; i < s.length; i++) {
    const p = s[i].p;
    if (dir === 'rise' ? p >= s[extreme].p : p <= s[extreme].p) { extreme = i; continue; }
    const turn = pct(s[extreme].p, p);
    if (dir === 'rise' ? turn <= -minPct : turn >= minPct) {
      push(pivot, extreme, dir);
      pivot = extreme; extreme = i; dir = dir === 'rise' ? 'fall' : 'rise';
    }
  }
  push(pivot, extreme, dir);
  return out;
}

function streak(moves: DayMove[], up: boolean): Streak | null {
  let best: Streak | null = null, start = -1;
  for (let i = 0; i <= moves.length; i++) {
    const ok = i < moves.length && (up ? moves[i].pct > 0 : moves[i].pct < 0);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      const days = i - start;
      if (!best || days > best.days) {
        const growth = moves.slice(start, i).reduce((a, m) => a * (1 + m.pct / 100), 1);
        best = { kind: up ? 'up' : 'down', from: moves[start].date, to: moves[i - 1].date, days, pct: (growth - 1) * 100 };
      }
      start = -1;
    }
  }
  return best;
}

// Back-adjust every close before an ex-date (the first trading day after the record date) for the cash paid and the bonus shares.
function adjust(s: SeriesPoint[], declarations: readonly Declaration[], face: number): { adj: Adj[]; exDates: ExDate[] } {
  const factor = s.map(() => 1);
  const exDates: ExDate[] = [];
  const seen = new Set<string>();
  for (const d of declarations) {
    const cash = d.cashPct ?? 0, stock = d.stockPct ?? 0;
    if (d.noDividend || !d.recordDate || seen.has(d.recordDate) || (cash <= 0 && stock <= 0)) continue;
    const k = s.findIndex((p) => p.date > d.recordDate!);
    if (k < 1) continue;
    seen.add(d.recordDate);
    const prev = s[k - 1].price;
    const f = ((prev - (cash / 100) * face) / prev) / (1 + stock / 100);
    if (!(f > 0 && f <= 1)) continue;
    for (let i = 0; i < k; i++) factor[i] *= f;
    exDates.push({ date: s[k].date, recordDate: d.recordDate, cashPct: d.cashPct ?? null, stockPct: d.stockPct ?? null });
  }
  return { adj: s.map((raw, i) => ({ date: raw.date, p: raw.price * factor[i], raw })), exDates: exDates.sort((a, b) => a.date.localeCompare(b.date)) };
}

// priceNow: the price the lists use (live when trading); the last close when not given.
export function priceHistory(series: readonly SeriesPoint[], declarations: readonly Declaration[] = [], faceValue: number | null = DEFAULT_FACE_VALUE, priceNow: number | null = null): PriceHistory | null {
  const valid = series.filter((p) => Number.isFinite(p.price) && p.price > 0);
  if (valid.length < 2) return null;
  const windowStart = daysBefore(valid.at(-1)!.date, WINDOW_DAYS);
  const inWindow = valid.filter((p) => p.date >= windowStart);
  const all = valid.filter(traded);
  const lastTradeDate = all.at(-1)?.date ?? null;
  const { adj, exDates } = adjust(all, declarations, faceValue || DEFAULT_FACE_VALUE);
  const tradedInWindow = adj.filter((p) => p.date >= windowStart);
  const illiquid = tradedInWindow.length === 0;
  // A share with under two trades in the window has no moves; its flat window prices still give the range.
  const s: Adj[] = tradedInWindow.length >= 2 ? tradedInWindow : inWindow.map((raw) => ({ date: raw.date, p: raw.price, raw }));
  if (s.length < 2) return null;
  const moves: DayMove[] = tradedInWindow.length >= 2 ? s.slice(1).map((p, i) => ({ date: p.date, close: p.raw.price, pct: pct(s[i].p, p.p), volume: p.raw.volume })) : [];
  const byPct = [...moves].sort((a, b) => b.pct - a.pct);
  const hi = s.reduce((a, p) => (p.raw.price > a.raw.price ? p : a)).raw, lo = s.reduce((a, p) => (p.raw.price < a.raw.price ? p : a)).raw;
  const dh = s.reduce((a, p) => (top(p.raw) > top(a.raw) ? p : a)).raw, dl = s.reduce((a, p) => (bottom(p.raw) < bottom(a.raw) ? p : a)).raw;
  const now = priceNow && priceNow > 0 ? priceNow : valid.at(-1)!.price;
  const year = oneYearChange(valid, now);
  const dividendCash = year ? cashInWindow(declarations, year.yearAgo.date, valid.at(-1)!.date, faceValue) : 0;
  const jan = `${s.at(-1)!.date.slice(0, 4)}-01-01`;
  const prevYearEnd = [...adj].reverse().find((p) => p.date < jan);
  const flat = tradedInWindow.length < 2;
  return {
    from: s[0].date, to: s.at(-1)!.date, days: tradedInWindow.length,
    changePct: year?.pct ?? null, dividendCash, totalReturnPct: year ? pct(year.yearAgo.price, now + dividendCash) : null,
    high: { date: hi.date, price: hi.price }, low: { date: lo.date, price: lo.price },
    dayHigh: { date: dh.date, price: top(dh) }, dayLow: { date: dl.date, price: bottom(dl) },
    months: flat ? [] : monthRows(s), swings: flat ? [] : swings(s, SWING_MIN_PCT), swingsSmall: flat ? [] : swings(s, SWING_SMALL_PCT),
    bestDays: byPct.filter((m) => m.pct > 0).slice(0, TOP_DAYS), worstDays: byPct.filter((m) => m.pct < 0).reverse().slice(0, TOP_DAYS),
    longestUp: streak(moves, true), longestDown: streak(moves, false),
    upDays: moves.filter((m) => m.pct > 0).length, downDays: moves.filter((m) => m.pct < 0).length,
    sinceJan: prevYearEnd && adj.length ? pct(prevYearEnd.p, adj.at(-1)!.p) : null,
    exDates: exDates.filter((e) => e.date >= windowStart), noTradeDays: inWindow.length - tradedInWindow.length, lastTradeDate, illiquid,
  };
}
