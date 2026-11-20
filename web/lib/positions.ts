import { CODE_RE, tradingDaysBetween } from './dhaka.ts';

export const DEFAULT_STOP_PCT = 10;
export const DEFAULT_TARGET_PCT = 20;
export const MAX_WEIGHT_TO_ADD_PCT = 25;
export const DIVIDEND_SOON_TRADING_DAYS = 10;
const PCT_LIMIT = 95;
const MIN_PCT = 1;

export type PositionAction = 'review' | 'take-profit' | 'hold-dividend' | 'add' | 'hold';

export const ACTION_TEXT: Record<PositionAction, { label: string; tone: 'bad' | 'warn' | 'info' | 'good' | 'neutral' }> = {
  review: { label: 'Review — consider selling', tone: 'bad' },
  'take-profit': { label: 'Consider taking some profit', tone: 'warn' },
  'hold-dividend': { label: 'Hold — dividend coming', tone: 'info' },
  add: { label: 'Could buy more', tone: 'good' },
  hold: { label: 'Hold', tone: 'neutral' },
};

export interface Limits { stopPct: number; targetPct: number }

export interface PositionInput {
  shares: number;
  avgCost: number;
  price: number | null;
  weightPct: number | null;
  signal: 'avoid' | 'caution' | 'neutral' | 'research' | null;
  fraud: 'clean' | 'suspicious' | 'high' | null;
  zone: 'low' | 'middle' | 'high' | null;
  verdictKey: string | null;
  dividend: { lastBuyDate: string | null; cashPct: number | null } | null;
}

export interface PositionCheck { action: PositionAction; label: string; tone: string; reasons: string[]; plPct: number | null }

export function validLimits(raw: Partial<Record<keyof Limits, unknown>>): Limits | null {
  // Only real numbers or numeric strings count: Number(true) is 1 and Number([5]) is 5.
  const asNumber = (x: unknown) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '') ? Number(x) : NaN);
  const stopPct = asNumber(raw.stopPct);
  const targetPct = asNumber(raw.targetPct);
  const ok = (x: number) => Number.isFinite(x) && x >= MIN_PCT && x <= PCT_LIMIT;
  return ok(stopPct) && ok(targetPct) ? { stopPct, targetPct } : null;
}

const pct = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;

// Fixed, visible rules on the owner's own numbers; the first rule that matches wins. A learning aid, not advice.
export function checkPosition(p: PositionInput, limits: Limits, today: string): PositionCheck {
  const plPct = p.price != null && p.avgCost > 0 ? ((p.price - p.avgCost) / p.avgCost) * 100 : null;
  const done = (action: PositionAction, reasons: string[]): PositionCheck => ({ action, ...ACTION_TEXT[action], reasons, plPct });
  const vsCost = plPct == null ? 'no live price' : `${pct(plPct)} vs your cost ৳${p.avgCost.toFixed(2)}`;

  const review: string[] = [];
  if (p.fraud === 'high') review.push('High fraud risk on this company');
  if (p.signal === 'avoid') review.push('The signal is Avoid');
  if (plPct != null && plPct <= -limits.stopPct) review.push(`Down ${Math.abs(plPct).toFixed(1)}% from your cost — past your ${limits.stopPct}% stop-loss`);
  if (review.length) return done('review', [...review, vsCost]);

  if (plPct != null && plPct >= limits.targetPct && p.zone === 'high') {
    return done('take-profit', [`Up ${plPct.toFixed(1)}% — past your ${limits.targetPct}% target`, 'P/E is high against its own 5-year history']);
  }

  const lastBuy = p.dividend?.lastBuyDate;
  const left = lastBuy && lastBuy >= today ? tradingDaysBetween(today, lastBuy) : 0;
  if (p.fraud === 'clean' && left > 0 && left <= DIVIDEND_SOON_TRADING_DAYS) {
    const cash = p.dividend?.cashPct != null ? `${p.dividend.cashPct}% cash` : 'A dividend';
    return done('hold-dividend', [`${cash} — own it at the end of ${lastBuy} to get it (${left} trading ${left === 1 ? 'day' : 'days'} left)`, vsCost]);
  }

  const smallEnough = p.weightPct == null || p.weightPct < MAX_WEIGHT_TO_ADD_PCT;
  if (p.signal === 'research' && p.verdictKey === 'value' && plPct != null && plPct < 0 && smallEnough) {
    return done('add', ['Worth researching, and cheap against its own history', `${Math.abs(plPct).toFixed(1)}% below your average cost`, `Only ${p.weightPct == null ? '—' : p.weightPct.toFixed(0) + '%'} of your holdings`]);
  }

  const why = [vsCost];
  if (p.signal === 'caution') why.unshift('Caution signal — re-check after the next results');
  if (p.fraud === 'suspicious') why.unshift('One fraud warning pattern — keep an eye on it');
  if (plPct != null && plPct >= limits.targetPct) why.push(`Up ${plPct.toFixed(1)}% — past your ${limits.targetPct}% target, but the price is not high against its own history`);
  else if (plPct != null) why.push(`Stop-loss ${limits.stopPct}% and target ${limits.targetPct}% not reached`);
  return done('hold', why);
}

export interface LimitSettings { default: Limits; perCode: Record<string, Limits> }


// Sheet rows are [code, stop_pct, target_pct]; code "*" holds the default. Bad rows are ignored, never fatal.
export function settingsFromRows(rows: readonly string[][]): LimitSettings {
  const out: LimitSettings = { default: { stopPct: DEFAULT_STOP_PCT, targetPct: DEFAULT_TARGET_PCT }, perCode: {} };
  for (const [code = '', stopPct, targetPct] of rows) {
    const l = validLimits({ stopPct, targetPct });
    const c = code.trim().toUpperCase();
    if (!l) continue;
    if (c === '*') out.default = l;
    else if (CODE_RE.test(c)) out.perCode[c] = l;
  }
  return out;
}

export function settingsToRows(s: LimitSettings): string[][] {
  return [['*', String(s.default.stopPct), String(s.default.targetPct)], ...Object.entries(s.perCode).sort(([a], [b]) => a.localeCompare(b)).map(([c, l]) => [c, String(l.stopPct), String(l.targetPct)])];
}

export function parseSettings(input: unknown): LimitSettings | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { default?: Record<string, unknown>; perCode?: Record<string, Record<string, unknown>> };
  const def = validLimits(raw.default ?? {});
  if (!def) return null;
  const perCode: Record<string, Limits> = {};
  for (const [code, l] of Object.entries(raw.perCode ?? {})) {
    const c = code.trim().toUpperCase();
    const v = validLimits(l ?? {});
    if (!CODE_RE.test(c) || !v) return null;
    perCode[c] = v;
  }
  return { default: def, perCode };
}
