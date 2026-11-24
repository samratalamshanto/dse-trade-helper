// Dividend "value for money" facts and five neutral checks for the Dividends page; facts only, never buy or sell advice.
import { rangeStats } from './range.ts';

export const YIELD_MIN_PCT = 5;
export const PAID_YEARS_MIN = 4;
export const PAID_YEARS_WINDOW = 5;
const TEN_K = 10_000;
const DAY_MS = 86_400_000;

export interface DividendInput {
  price: number | null;
  yieldPct: number | null;
  yearlyCashPerShare: number | null;
  eps: number | null;
  avgYieldPct: number | null;
  paidYears: number | null;
  fraud: string | null;
  weekLow52: number | null;
  weekHigh52: number | null;
}

export type CheckState = 'pass' | 'fail' | 'unknown';
export interface DividendCheck { key: 'yield' | 'profit' | 'years' | 'warning' | 'range'; state: CheckState; text: string }

const num = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d + 0;

// Yearly cash for ৳10,000 invested at today's price: 10,000 × the 12-month cash yield.
export const perTenK = (yieldPct: number | null): number | null => (num(yieldPct) && yieldPct >= 0 ? round((TEN_K * yieldPct) / 100) : null);

// Cash from one dividend for ৳10,000 invested at today's price.
export const dividendPerTenK = (cashPerShare: number | null, price: number | null): number | null =>
  num(cashPerShare) && num(price) && price > 0 ? round((cashPerShare / price) * TEN_K) : null;

// 0 = at the 52-week low, 1 = at the high. A flat range (low = high) tells nothing, so it is not known.
// One rounding for every 52-week percent: down, so a pass (under 50%) never shows 50%.
export const rangePct = (pos: number): number => Math.floor(pos * 100 + 1e-9);

export function rangePos(price: number | null, low: number | null, high: number | null): number | null {
  if (num(low) && num(high) && low === high) return null;
  return rangeStats({ code: '', price, weekLow52: low, weekHigh52: high })?.position ?? null;
}

// Today's yield minus the company's 5-year average yield, in percentage points.
export const yieldVsUsual = (yieldPct: number | null, avgYieldPct: number | null): number | null =>
  num(yieldPct) && num(avgYieldPct) ? round(yieldPct - avgYieldPct, 1) : null;

// Cash dividend per share ÷ EPS, in %. Not known without EPS or without a cash dividend; a loss (EPS 0 or below) gives no ratio.
export const paidFromProfit = (cashPerShare: number | null, eps: number | null): number | null =>
  num(cashPerShare) && cashPerShare > 0 && num(eps) && eps > 0 ? round((cashPerShare / eps) * 100) : null;

// Years with a cash dividend among the PAID_YEARS_WINDOW years up to newestYear; null when there is no history.
export function paidYears(dividends: readonly { year: number; cash?: number | null }[], newestYear: number): number | null {
  if (!dividends.length) return null;
  const years = new Set(dividends.filter((d) => d.year > newestYear - PAID_YEARS_WINDOW && d.year <= newestYear && (d.cash ?? 0) > 0).map((d) => d.year));
  return years.size;
}

// Calendar days from today to the record date; null when it is missing or already passed.
export function daysUntil(today: string, date: string | null): number | null {
  if (!date) return null;
  const n = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / DAY_MS);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const check = (key: DividendCheck['key'], state: CheckState, text: string): DividendCheck => ({ key, state, text });

// Each known check names the figure it was decided on and its rule, so the table needs no column for it.
export function dividendChecks(r: DividendInput): DividendCheck[] {
  const pos = rangePos(r.price, r.weekLow52, r.weekHigh52);
  const payout = paidFromProfit(r.yearlyCashPerShare, r.eps);
  const loss = num(r.eps) && r.eps <= 0 && (r.yearlyCashPerShare ?? 0) > 0;
  return [
    num(r.yieldPct) ? check('yield', r.yieldPct >= YIELD_MIN_PCT ? 'pass' : 'fail', `12-month cash yield: ${r.yieldPct.toFixed(2)}% (5% or more passes)`)
      : check('yield', 'unknown', '12-month cash yield is not known.'),
    loss ? check('profit', 'fail', 'The company made a loss, so the dividend is not paid from profit.')
      : payout != null ? check('profit', payout <= 100 ? 'pass' : 'fail', `Paid from profit: ${payout}% of EPS (100% or less passes)`)
        : check('profit', 'unknown', 'No cash dividend in 12 months, or profit (EPS) is not known.'),
    r.paidYears != null ? check('years', r.paidYears >= PAID_YEARS_MIN ? 'pass' : 'fail', `Paid in ${r.paidYears} of last 5 years (4 or more passes)`)
      : check('years', 'unknown', 'Dividend history is not known.'),
    !r.fraud ? check('warning', 'unknown', 'Warning signs are not known.') : r.fraud === 'clean' ? check('warning', 'pass', 'No warning sign found.') : check('warning', 'fail', 'Has a warning sign.'),
    // Floor, so a shown "50%" is never a pass (the rule is under half).
    pos != null ? check('range', pos < 0.5 ? 'pass' : 'fail', `52-week position: ${rangePct(pos)}% of range (under 50% passes)`)
      : check('range', 'unknown', '52-week range is not known.'),
  ];
}

export const passCount = (checks: readonly DividendCheck[]): number => checks.filter((c) => c.state === 'pass').length;
