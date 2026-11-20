import type { MoveOdds } from '../../lib/buy-planner.ts';
import type { LiveStatus, PlanStatus, SavedPlan } from '../../lib/plans.ts';

export type LivePlan = SavedPlan & { price: number | null; live: PlanStatus };
export interface PlansList { plans: LivePlan[]; badRows: number[] }

const FRIDAY = 5, SATURDAY = 6;

// DSE trades Sunday to Thursday; the date `n` trading days after `fromIso` (no holiday list).
export function plusTradingDays(fromIso: string, n: number): string {
  const d = new Date(fromIso + 'T00:00:00Z');
  for (let left = n; left > 0;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== FRIDAY && d.getUTCDay() !== SATURDAY) left--;
  }
  return d.toISOString().slice(0, 10);
}

// One plain sentence from the 2% row: what happened in the past, never a forecast.
export function moveSentence(odds: readonly MoveOdds[], pct = 2): string | null {
  const o = odds.find((x) => x.pct === pct);
  if (!o || o.fell == null || o.rose == null) return null;
  const more = o.fell > o.rose ? `a ${pct}% fall was more common than a ${pct}% rise` : o.fell < o.rose ? `a ${pct}% rise was more common than a ${pct}% fall` : `a ${pct}% fall and a ${pct}% rise were equally common`;
  return `Over the last year, within ${o.within} trading days ${more} (${o.fell}% vs ${o.rose}% of days).`;
}

export const TONE_PILL: Record<string, string> = { bad: 's-avoid', warn: 's-caution', info: 's-info', good: 's-research', neutral: 's-neutral' };
export const STATUS_PILL: Record<LiveStatus, string> = { reached: 's-research', waiting: 's-info', expired: 's-caution', done: 's-neutral', cancelled: 's-neutral' };
