import { tradingDaysBetween } from '../../web/lib/dhaka.ts';
import type { CompanyRow, DividendSoon, Signal } from './api.ts';
import { matchesQuery } from './format.ts';

export interface Catchable { d: DividendSoon; tradingDaysLeft: number; lastDayIsToday: boolean }

// Dividends a buyer can still get: at least one trading day left up to the last buy day, clean companies first, then soonest.
export function catchableDividends(rows: readonly DividendSoon[], today: string): Catchable[] {
  return rows
    .filter((d): d is DividendSoon & { lastBuyDate: string } => !!d.lastBuyDate && d.lastBuyDate >= today)
    .map((d) => ({ d, tradingDaysLeft: tradingDaysBetween(today, d.lastBuyDate), lastDayIsToday: d.lastBuyDate === today }))
    .filter((x) => x.tradingDaysLeft > 0)
    .sort((a, b) => Number(a.d.fraud !== 'clean') - Number(b.d.fraud !== 'clean') || a.tradingDaysLeft - b.tradingDaysLeft);
}

export type SortKey = 'score' | 'change' | 'name';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Best score' },
  { key: 'change', label: 'Top gainers' },
  { key: 'name', label: 'A–Z' },
];

export interface ListOptions { query: string; signal: Signal | null; sort: SortKey }

const byNumberDesc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);

export function filterSort(rows: readonly CompanyRow[], { query, signal, sort }: ListOptions): CompanyRow[] {
  const kept = rows.filter((r) => matchesQuery(r, query) && (!signal || r.signal === signal));
  const compare: Record<SortKey, (a: CompanyRow, b: CompanyRow) => number> = {
    score: (a, b) => b.score - a.score || a.code.localeCompare(b.code),
    change: (a, b) => byNumberDesc(a.changePct, b.changePct) || a.code.localeCompare(b.code),
    name: (a, b) => a.code.localeCompare(b.code),
  };
  return [...kept].sort(compare[sort]);
}
