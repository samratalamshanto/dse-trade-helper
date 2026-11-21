// Yearly trend series for the 5-year financials cards; pure, so the formulas are unit-tested.
import type { Dividend, YearRow } from './types.ts';

export type TrendPoint = { year: number; value: number };
export type TrendKey = 'profit' | 'eps' | 'nav' | 'roe' | 'payout' | 'pe' | 'pb';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// DSE gives net profit in million taka; the cards show crore (1 crore = 10 million).
export const profitCrore = (y: YearRow): number | null => { const p = num(y.profit); return p == null ? null : p / 10; };
export const roePct = (eps: number | null, nav: number | null): number | null => (eps != null && nav != null && nav > 0 ? (eps / nav) * 100 : null);
// Cash per share = cash dividend % × face value ÷ 100; payout = that ÷ EPS.
export const payoutPct = (cashPct: number | null, face: number, eps: number | null): number | null =>
  cashPct != null && eps != null && eps > 0 ? (((cashPct * face) / 100) / eps) * 100 : null;
// Year-end price = P/E × EPS, so P/B = P/E × EPS ÷ NAV.
export const pbAtYearEnd = (pe: number | null, eps: number | null, nav: number | null): number | null =>
  pe != null && pe > 0 && eps != null && eps > 0 && nav != null && nav > 0 ? (pe * eps) / nav : null;

export const GROWTH_YEARS = 5;
// Growth of an amount below this share of the 5-year median is a base too small to compound from.
const MIN_BASE_SHARE = 0.4;
// How each card states its change over GROWTH_YEARS: CAGR for amounts, percentage points for % ratios, plain difference for P/E and P/B.
export const TREND_KIND: Record<TrendKey, 'cagr' | 'pp' | 'diff'> = { profit: 'cagr', eps: 'cagr', nav: 'cagr', roe: 'pp', payout: 'pp', pe: 'diff', pb: 'diff' };

// Bonus shares issued for year Z split every earlier per-share figure; divide by them so all years count today's shares.
// DSE's own restated EPS covers one bonus only (BATBC 2018 restated ৳55.62 still predates the 2020 bonus), so it is not used.
export function bonusFactor(dividends: readonly Dividend[], lastYear: number): (year: number) => number {
  const bonus = dividends.filter((d) => (num(d.stock) ?? 0) > 0 && d.year < lastYear);
  return (year) => bonus.filter((d) => d.year >= year).reduce((f, d) => f * (1 + (d.stock as number) / 100), 1);
}

// One series per card; a year with a missing input is left out instead of plotted as zero. EPS and NAV are bonus-adjusted.
export function trendSeries(years: readonly YearRow[], dividends: readonly Dividend[], face = 10): Record<TrendKey, TrendPoint[]> {
  const cash = new Map(dividends.map((d) => [d.year, num(d.cash)]));
  const f = bonusFactor(dividends, years.at(-1)?.year ?? 0);
  const per = (v: number | null, year: number) => (v == null ? null : v / f(year));
  const pick = (f: (y: YearRow) => number | null): TrendPoint[] =>
    years.flatMap((y) => { const v = f(y); return v != null && Number.isFinite(v) ? [{ year: y.year, value: v }] : []; });
  return {
    profit: pick(profitCrore),
    eps: pick((y) => per(num(y.eps), y.year)),
    nav: pick((y) => per(num(y.nav), y.year)),
    roe: pick((y) => roePct(num(y.eps), num(y.nav))),
    payout: pick((y) => payoutPct(cash.get(y.year) ?? null, face, num(y.eps))),
    pe: pick((y) => { const pe = num(y.pe); return pe != null && pe > 0 ? pe : null; }),
    pb: pick((y) => pbAtYearEnd(num(y.pe), num(y.eps), num(y.nav))),
  };
}

// Compound yearly growth from the first to the last point; null when either end is not positive.
export function cagr(points: readonly TrendPoint[]): { pct: number; years: number } | null {
  const first = points[0], last = points.at(-1);
  if (!first || !last || last.year <= first.year || first.value <= 0 || last.value <= 0) return null;
  const years = last.year - first.year;
  return { pct: (Math.pow(last.value / first.value, 1 / years) - 1) * 100, years };
}

export interface TrendChange { kind: 'cagr' | 'pp' | 'diff'; value: number; years: number; from: number; to: number }

// The one growth rule (cards, metrics, notes): last GROWTH_YEARS points; an amount compounds from its first normal-sized
// positive year, a ratio reports the plain change from first to last.
export function trendChange(points: readonly TrendPoint[], kind: TrendChange['kind'] = 'cagr'): TrendChange | null {
  const last5 = points.slice(-GROWTH_YEARS), last = last5.at(-1);
  if (!last) return null;
  if (kind !== 'cagr') return last5.length >= 2 ? { kind, value: last.value - last5[0].value, years: last.year - last5[0].year, from: last5[0].year, to: last.year } : null;
  const s = last5.map((p) => p.value).sort((a, b) => a - b), m = Math.floor(s.length / 2);
  const typical = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  const base = last5.find((p) => p.value > 0 && p.value >= MIN_BASE_SHARE * typical);
  const g = base ? cagr([base, last]) : null;
  return g ? { kind, value: g.pct, years: g.years, from: base!.year, to: last.year } : null;
}
