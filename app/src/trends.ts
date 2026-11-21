import { bonusFactor, TREND_KIND, trendChange, type TrendChange } from '../../web/lib/financial-trends.ts';
import type { Dividend, YearRow } from '../../web/lib/types.ts';

export interface TrendPoint { year: number; value: number }
export type TrendKey = 'profit' | 'eps' | 'nav' | 'roe' | 'payout';
export interface Trend { key: TrendKey; label: string; points: TrendPoint[]; cagr: number | null; span: number; change: TrendChange | null }

// The API sends some year fields as strings ("280.00"), so every input is read as a number.
const num = (x: unknown): number | null => {
  const n = typeof x === 'string' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// Compound annual growth in %, only when both ends are positive and at least one year apart.
export function cagr(first: number, last: number, years: number): number | null {
  if (!(first > 0) || !(last > 0) || years < 1) return null;
  return ((last / first) ** (1 / years) - 1) * 100;
}

const ratio = (top: number | null, bottom: number | null) => (top != null && bottom != null && bottom > 0 ? (top / bottom) * 100 : null);

// Net profit, EPS, NAV/share, ROE (EPS ÷ NAV) and dividend payout (cash per share ÷ EPS); years with missing inputs are skipped.
// EPS and NAV are divided by later bonus shares and the change uses the web's one growth rule, so phone and web agree.
export function financialTrends(years: readonly YearRow[], faceValue: number | null | undefined, dividends: readonly Dividend[] = []): Trend[] {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const bonus = bonusFactor(dividends, sorted.at(-1)?.year ?? 0);
  const pick: Record<TrendKey, [string, (y: YearRow) => number | null]> = {
    profit: ['Net profit', (y) => num(y.profit)],
    eps: ['EPS', (y) => { const v = num(y.eps); return v == null ? null : v / bonus(y.year); }],
    nav: ['NAV per share', (y) => { const v = num(y.nav); return v == null ? null : v / bonus(y.year); }],
    roe: ['Return on equity', (y) => ratio(num(y.eps), num(y.nav))],
    payout: ['Dividend payout', (y) => {
      const pct = num(y.dividend);
      return ratio(pct != null && faceValue ? (pct * faceValue) / 100 : null, num(y.eps));
    }],
  };
  return (Object.keys(pick) as TrendKey[]).map((key) => {
    const [label, read] = pick[key];
    const points = sorted.flatMap((y) => { const value = read(y); return value == null ? [] : [{ year: y.year, value }]; });
    const first = points[0];
    const last = points[points.length - 1];
    const span = first && last ? last.year - first.year : 0;
    const isGrowthMetric = key === 'profit' || key === 'eps' || key === 'nav';
    return { key, label, points, span, cagr: isGrowthMetric && first && last ? cagr(first.value, last.value, span) : null, change: trendChange(points, TREND_KIND[key]) };
  });
}
