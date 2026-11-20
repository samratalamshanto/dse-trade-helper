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

// One series per card; a year with a missing input is left out instead of plotted as zero.
export function trendSeries(years: readonly YearRow[], dividends: readonly Dividend[], face = 10): Record<TrendKey, TrendPoint[]> {
  const cash = new Map(dividends.map((d) => [d.year, num(d.cash)]));
  const pick = (f: (y: YearRow) => number | null): TrendPoint[] =>
    years.flatMap((y) => { const v = f(y); return v != null && Number.isFinite(v) ? [{ year: y.year, value: v }] : []; });
  return {
    profit: pick(profitCrore),
    eps: pick((y) => num(y.eps)),
    nav: pick((y) => num(y.nav)),
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
