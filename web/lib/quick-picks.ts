import type { CompanyRow } from './service.ts';

const LIQUID_BDT = 1_000_000;
type Medians = Record<string, number | null>;

function pickMedians(rows: readonly CompanyRow[]): Medians {
  const bySector: Record<string, number[]> = {};
  for (const r of rows) {
    if (r.pe != null && r.pe > 0 && r.sector) (bySector[r.sector] ??= []).push(r.pe);
  }
  const med = (xs: number[]): number | null => {
    if (xs.length < 3) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return Object.fromEntries(Object.entries(bySector).map(([s, xs]) => [s, med(xs)]));
}

export type QuickPickKey = 'good' | 'cheap' | 'dividend' | 'growth' | 'avoid';

export interface QuickPick {
  key: QuickPickKey;
  label: string;
  hint: string;
  sort: string;
  dir: number;
  test: (r: CompanyRow, m: Medians) => boolean;
}

export const QUICK_PICKS: QuickPick[] = [
  { key: 'good', label: 'Good companies', hint: 'Passes all quality checks, at any price.', sort: 'score', dir: -1,
    test: (r) => r.signal === 'research' },
  { key: 'cheap', label: 'Low P/E vs sector', hint: 'Passes the checks, with a P/E at or below its sector median.', sort: 'pe', dir: 1,
    test: (r, m) => r.signal === 'research' && r.pe != null && m[r.sector] != null && r.pe <= (m[r.sector] as number) },
  { key: 'dividend', label: 'High dividend', hint: "Yield 5%+ at today's price, no warning sign, easy to trade.", sort: 'dividendYield', dir: -1,
    test: (r) => (r.dividendYield ?? 0) >= 5 && r.fraud === 'clean' && (r.dailyValue ?? 0) >= LIQUID_BDT },
  { key: 'growth', label: 'Rising earnings', hint: 'Earnings per share growing 15%+ a year, no warning sign.', sort: 'epsCagr', dir: -1,
    test: (r) => (r.epsCagr ?? -Infinity) >= 15 && r.fraud === 'clean' },
  { key: 'avoid', label: 'High-risk list', hint: 'Loss-making, category Z or several warning-sign patterns.', sort: 'score', dir: 1,
    test: (r) => r.signal === 'avoid' },
];

export const QUICK_PICK_KEYS: readonly QuickPickKey[] = QUICK_PICKS.map((p) => p.key);

export function matchesPick(key: QuickPickKey, row: CompanyRow, rows: readonly CompanyRow[]): boolean {
  const pick = QUICK_PICKS.find((p) => p.key === key);
  if (!pick) return false;
  const medians = key === 'cheap' ? pickMedians(rows) : {};
  return pick.test(row, medians);
}
