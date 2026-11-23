import type { MarketSession } from '@/lib/dse';

export const fmt = (n: number | null | undefined, d = 2): string =>
  n == null || !Number.isFinite(n) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export const signed = (n: number | null | undefined, d = 1): string => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmt(n, d)}%`);

export const tone = (n: number | null | undefined): string => (n == null || n === 0 ? '' : n > 0 ? 'up' : 'down');

export const pctNum = (v: number | null | undefined): string => (v == null ? '—' : Number.isInteger(v) ? String(v) : fmt(v, 2));

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

export const fmtDateLang = (iso: string | null | undefined, lang: string): string => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  if (lang === 'bn') return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const monthName = (ym: string | null | undefined): string =>
  ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';

export { dhakaToday } from '../lib/dhaka.ts';

// One unit everywhere: crore taka (৳1 cr = ৳100 lakh).
export function moneyPerDay(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v < 1e5) return 'under ৳0.01 cr';
  return '৳' + fmt(v / 1e7, v >= 1e7 ? 1 : 2) + ' cr';
}

const SECTOR_NAMES: Record<string, string> = {
  'Financial In': 'Financial institutions', TravelLeisur: 'Travel & leisure', ServRealEst: 'Services & real estate', PharmaChem: 'Pharma & chemicals',
  FoodAllied: 'Food & allied', FuelPower: 'Fuel & power', PaperPrint: 'Paper & printing', Misc: 'Miscellaneous', MutFund: 'Mutual funds',
};
export const sectorName = (s: string): string => SECTOR_NAMES[s] || s;

export type MarketStateKey = 'open' | 'preopen' | 'closed' | 'unknown';

// One place decides the market state, so the header and the dashboard never disagree.
export function marketState(s: MarketSession | null | undefined): { key: MarketStateKey; short: string; long: string } {
  if (!s) return { key: 'unknown', short: 'Unknown', long: '' };
  const dhakaNow = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(11, 16);
  if (s.isOpen) return { key: 'open', short: '● Open', long: 'Market open · updates every minute' };
  if (s.tradingDay && s.opening && dhakaNow < s.opening) return { key: 'preopen', short: 'Pre-open', long: `Pre-open · market opens ${s.opening} today` };
  return { key: 'closed', short: 'Closed', long: `Market closed${s.next ? ` · next session ${fmtDate(s.next)}` : ''}` };
}

const OPEN_GRACE_MIN = 15;
const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const SLOW_REFRESH_MS = 5 * 60_000;

export function shouldAutoRefresh(s: MarketSession | null | undefined): boolean {
  if (marketState(s).key === 'open') return true;
  if (!s?.tradingDay || !s.opening) return false;
  const dhakaNow = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(11, 16);
  return Math.abs(minutes(dhakaNow) - minutes(s.opening)) <= OPEN_GRACE_MIN;
}

export function refreshDue(s: MarketSession | null | undefined, lastRefresh: number, now = Date.now()): boolean {
  return shouldAutoRefresh(s) || now - lastRefresh >= SLOW_REFRESH_MS;
}

// Empty values (no P/E, no yield) always sort to the end, whichever direction is chosen.
export function compareNullsLast(x: unknown, y: unknown, dir: number): number {
  const empty = (v: unknown) => v == null || (typeof v === 'number' && !Number.isFinite(v));
  if (empty(x) || empty(y)) return empty(x) === empty(y) ? 0 : empty(x) ? 1 : -1;
  return ((x as number) > (y as number) ? 1 : (x as number) < (y as number) ? -1 : 0) * dir;
}
