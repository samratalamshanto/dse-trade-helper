import type { SeriesPoint } from './types.ts';

// A move counts as a rise or a fall once the close turns by at least this much from the last turning point.
export const SWING_MIN_PCT = 10;
const TOP_DAYS = 5;

export interface MonthRow { month: string; open: number; close: number; high: number; low: number; changePct: number; avgVolume: number; trades: number | null; days: number }
export interface Swing { kind: 'rise' | 'fall'; from: string; to: string; fromPrice: number; toPrice: number; pct: number; days: number }
export interface DayMove { date: string; close: number; pct: number; volume: number }
export interface Streak { kind: 'up' | 'down'; from: string; to: string; days: number; pct: number }
export interface PriceHistory {
  from: string; to: string; days: number; changePct: number;
  high: { date: string; price: number }; low: { date: string; price: number };
  // Highest daily high and lowest daily low (intraday), when DSE sends them; else the close.
  dayHigh: { date: string; price: number }; dayLow: { date: string; price: number };
  months: MonthRow[]; swings: Swing[]; bestDays: DayMove[]; worstDays: DayMove[];
  longestUp: Streak | null; longestDown: Streak | null; upDays: number; downDays: number;
}

const pct = (from: number, to: number) => ((to - from) / from) * 100;

function monthRows(s: SeriesPoint[]): MonthRow[] {
  const groups = new Map<string, SeriesPoint[]>();
  for (const p of s) { const k = p.date.slice(0, 7); groups.set(k, [...(groups.get(k) ?? []), p]); }
  let prevClose: number | null = null;
  return [...groups].map(([month, pts]) => {
    const close = pts.at(-1)!.price;
    const open = pts[0].open ?? pts[0].price;
    const base = prevClose ?? open;
    prevClose = close;
    const trades = pts.every((p) => p.trades == null) ? null : pts.reduce((a, p) => a + (p.trades ?? 0), 0);
    return {
      month, open, close, days: pts.length, trades,
      high: Math.max(...pts.map((p) => (p.high && p.high > 0 ? p.high : p.price))), low: Math.min(...pts.map((p) => (p.low && p.low > 0 ? p.low : p.price))),
      changePct: pct(base, close), avgVolume: pts.reduce((a, p) => a + (p.volume || 0), 0) / pts.length,
    };
  });
}

// Zigzag on closes: a turn of SWING_MIN_PCT or more from the running extreme ends one swing and starts the next.
function swings(s: SeriesPoint[]): Swing[] {
  const out: Swing[] = [];
  const push = (a: number, b: number, kind: Swing['kind']) =>
    out.push({ kind, from: s[a].date, to: s[b].date, fromPrice: s[a].price, toPrice: s[b].price, pct: pct(s[a].price, s[b].price), days: b - a });
  // Before the first swing: watch the lowest and highest close so far; the first 10% move away from one sets the direction.
  let lo = 0, hi = 0, i = 1, dir: Swing['kind'] | null = null, pivot = 0, extreme = 0;
  for (; i < s.length && !dir; i++) {
    if (s[i].price < s[lo].price) lo = i;
    if (s[i].price > s[hi].price) hi = i;
    if (pct(s[lo].price, s[i].price) >= SWING_MIN_PCT) { dir = 'rise'; pivot = lo; extreme = i; }
    else if (pct(s[hi].price, s[i].price) <= -SWING_MIN_PCT) { dir = 'fall'; pivot = hi; extreme = i; }
  }
  if (!dir) return out;
  for (; i < s.length; i++) {
    const p = s[i].price;
    if (dir === 'rise' ? p >= s[extreme].price : p <= s[extreme].price) { extreme = i; continue; }
    const turn = pct(s[extreme].price, p);
    if (dir === 'rise' ? turn <= -SWING_MIN_PCT : turn >= SWING_MIN_PCT) {
      push(pivot, extreme, dir);
      pivot = extreme; extreme = i; dir = dir === 'rise' ? 'fall' : 'rise';
    }
  }
  push(pivot, extreme, dir);
  return out;
}

function streak(moves: DayMove[], up: boolean): Streak | null {
  let best: Streak | null = null, start = -1, base = 0;
  for (let i = 0; i <= moves.length; i++) {
    const ok = i < moves.length && (up ? moves[i].pct > 0 : moves[i].pct < 0);
    if (ok && start < 0) { start = i; base = moves[i].close / (1 + moves[i].pct / 100); }
    if (!ok && start >= 0) {
      const days = i - start;
      if (!best || days > best.days) best = { kind: up ? 'up' : 'down', from: moves[start].date, to: moves[i - 1].date, days, pct: pct(base, moves[i - 1].close) };
      start = -1;
    }
  }
  return best;
}

export function priceHistory(series: SeriesPoint[]): PriceHistory | null {
  const s = series.filter((p) => Number.isFinite(p.price) && p.price > 0);
  if (s.length < 2) return null;
  const moves: DayMove[] = s.slice(1).map((p, i) => ({ date: p.date, close: p.price, pct: pct(s[i].price, p.price), volume: p.volume }));
  const byPct = [...moves].sort((a, b) => b.pct - a.pct);
  const hi = s.reduce((a, p) => (p.price > a.price ? p : a)), lo = s.reduce((a, p) => (p.price < a.price ? p : a));
  const top = (p: SeriesPoint) => (p.high && p.high > 0 ? p.high : p.price), bottom = (p: SeriesPoint) => (p.low && p.low > 0 ? p.low : p.price);
  const dh = s.reduce((a, p) => (top(p) > top(a) ? p : a)), dl = s.reduce((a, p) => (bottom(p) < bottom(a) ? p : a));
  return {
    from: s[0].date, to: s.at(-1)!.date, days: s.length, changePct: pct(s[0].price, s.at(-1)!.price),
    high: { date: hi.date, price: hi.price }, low: { date: lo.date, price: lo.price },
    dayHigh: { date: dh.date, price: top(dh) }, dayLow: { date: dl.date, price: bottom(dl) },
    months: monthRows(s), swings: swings(s),
    bestDays: byPct.filter((m) => m.pct > 0).slice(0, TOP_DAYS), worstDays: byPct.filter((m) => m.pct < 0).reverse().slice(0, TOP_DAYS),
    longestUp: streak(moves, true), longestDown: streak(moves, false),
    upDays: moves.filter((m) => m.pct > 0).length, downDays: moves.filter((m) => m.pct < 0).length,
  };
}
