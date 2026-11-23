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

const check = (key: DividendCheck['key'], state: CheckState, texts: Record<CheckState, string>): DividendCheck => ({ key, state, text: texts[state] });

export function dividendChecks(r: DividendInput): DividendCheck[] {
  const pos = rangePos(r.price, r.weekLow52, r.weekHigh52);
  const payout = paidFromProfit(r.yearlyCashPerShare, r.eps);
  const loss = num(r.eps) && r.eps <= 0 && (r.yearlyCashPerShare ?? 0) > 0;
  return [
    check('yield', !num(r.yieldPct) ? 'unknown' : r.yieldPct >= YIELD_MIN_PCT ? 'pass' : 'fail', {
      pass: '12-month cash yield is 5% or more.', fail: '12-month cash yield is under 5%.', unknown: '12-month cash yield is not known.',
    }),
    check('profit', loss ? 'fail' : payout == null ? 'unknown' : payout <= 100 ? 'pass' : 'fail', {
      pass: 'The cash dividend is within the yearly profit (EPS).',
      fail: loss ? 'The company made a loss, so the dividend is not paid from profit.' : 'The cash dividend is more than the yearly profit (EPS).',
      unknown: 'No cash dividend in 12 months, or profit (EPS) is not known.',
    }),
    check('years', r.paidYears == null ? 'unknown' : r.paidYears >= PAID_YEARS_MIN ? 'pass' : 'fail', {
      pass: 'Paid a cash dividend in 4 or more of the last 5 years.', fail: 'Paid a cash dividend in fewer than 4 of the last 5 years.', unknown: 'Dividend history is not known.',
    }),
    check('warning', !r.fraud ? 'unknown' : r.fraud === 'clean' ? 'pass' : 'fail', {
      pass: 'No warning sign found.', fail: 'Has a warning sign.', unknown: 'Warning signs are not known.',
    }),
    check('range', pos == null ? 'unknown' : pos < 0.5 ? 'pass' : 'fail', {
      pass: 'Price is in the lower half of its 52-week range.', fail: 'Price is in the upper half of its 52-week range.', unknown: '52-week range is not known.',
    }),
  ];
}

export const passCount = (checks: readonly DividendCheck[]): number => checks.filter((c) => c.state === 'pass').length;
