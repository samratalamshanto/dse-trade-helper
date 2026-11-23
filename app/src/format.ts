import { SIGNAL_TEXT } from '../../web/lib/glossary.ts';
import type { Signal } from './api.ts';
import type { Palette } from './theme.ts';

export type Tone = 'up' | 'down' | 'warn' | 'muted' | 'link';

const SIGNAL_TONE: Record<Signal, Tone> = { research: 'up', neutral: 'muted', caution: 'warn', avoid: 'down' };
export const SIGNAL_ORDER: Signal[] = ['research', 'neutral', 'caution', 'avoid'];
const SIGNAL_LABEL_APP: Record<Signal, string> = {
  research: 'Passes the checks',
  neutral: 'No strong signal',
  caution: 'Caution',
  avoid: 'High risk',
};
export const SIGNAL: Record<Signal, { label: string; text: string; tone: Tone }> = Object.fromEntries(
  SIGNAL_ORDER.map((k) => [k, { ...SIGNAL_TEXT[k], label: SIGNAL_LABEL_APP[k], tone: SIGNAL_TONE[k] }]),
) as Record<Signal, { label: string; text: string; tone: Tone }>;

const ANSWER_TONE: Record<string, Tone> = { yes: 'up', partly: 'warn', no: 'down', unknown: 'muted' };
// "No dividend soon" is information, not a warning, so it is not shown in alarm red.
export function answerColor(q: { answer: string; tab: string }, c: Palette): string {
  if (q.tab === 'dividends' && q.answer === 'no') return c.muted;
  return c[ANSWER_TONE[q.answer] ?? 'muted'];
}

export const TONE: Record<string, Tone> = { good: 'up', bad: 'down', warn: 'warn' };

export function fmtNum(x: number | null | undefined, digits = 2): string {
  return x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x > 0 ? '+' : ''}${x.toFixed(2)}%`;
}

export function fmtSigned(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x > 0 ? '+' : ''}${fmtNum(x)}`;
}

// Money with its sign in front of the taka symbol: +৳0.60, -৳0.20.
export function fmtTakaSigned(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  if (x > 0) return `+৳${fmtNum(x)}`;
  if (x < 0) return `-৳${fmtNum(-x)}`;
  return `৳${fmtNum(0)}`;
}

export function changeColor(x: number | null | undefined, c: Palette): string {
  if (x == null || x === 0) return c.muted;
  return x > 0 ? c.up : c.down;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '—';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : '—';
}

export function daysLeftText(tradingDays: number, lastDayIsToday: boolean): string {
  if (lastDayIsToday) return 'Last day to buy is today';
  return `${tradingDays} trading ${tradingDays === 1 ? 'day' : 'days'} left`;
}

export function matchesQuery(row: { code: string; name: string }, query: string): boolean {
  const q = query.trim().toUpperCase();
  return !q || row.code.includes(q) || row.name.toUpperCase().includes(q);
}

export function isSignal(x: unknown): x is Signal {
  return typeof x === 'string' && (SIGNAL_ORDER as string[]).includes(x);
}
