// Watchlist, broker rate and price-alert rules as key/value rows, so a connected Sheet keeps them for every device.
import { commissionFor } from './trades.ts';
import { parseWatchlist } from './watchlist.ts';
import { parseAlertStore, type AlertRule } from './alerts.ts';
import { parseRangeRules, type RangeRule } from './range.ts';

export const PREFS_COLUMNS = ['key', 'value'] as const;
export const LOW52_ALERTS_STORE = 'low52Alerts';
export interface Prefs { watchlist?: string[]; brokerCommissionPct?: string; alertRules?: AlertRule[]; rangeRules?: RangeRule[]; low52Alerts?: boolean }
// Keeps the Sheet cell (50,000 characters) and the request body small.
export const ALERT_RULES_MAX = 100;
export const PREFS_BODY_MAX_BYTES = 60_000;
// Browser flag: this browser has synced once with the current Sheet (cleared on connect and disconnect).
export const PREFS_SYNCED_STORE = 'prefsSynced';

// Rules go through the same checks as the Alerts page; damaged ones are dropped.
export const parseAlertRules = (v: unknown): AlertRule[] => parseAlertStore(JSON.stringify({ rules: v })).rules.slice(0, ALERT_RULES_MAX);

// '' (no rate) or a percentage that commissionFor accepts (0 to MAX_COMMISSION_PCT).
const rateOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || commissionFor('1', '1', t) !== '' ? t : null;
};

// Unknown keys and bad values are skipped, so a hand edit in the Sheet never breaks the page.
const isJsonList = (v: string): boolean => { try { return Array.isArray(JSON.parse(v)); } catch { return false; } };

export function prefsFromRows(rows: readonly string[][]): Prefs {
  const out: Prefs = {};
  for (const [key = '', value = ''] of rows) {
    // A cell that is not a JSON list is ignored, so a bad hand edit never empties every device's watchlist.
    if (key === 'watchlist' && isJsonList(value)) out.watchlist = parseWatchlist(value);
    if (key === 'alertRules' && isJsonList(value)) out.alertRules = parseAlertRules(JSON.parse(value));
    if (key === 'rangeRules' && isJsonList(value)) out.rangeRules = parseRangeRules(JSON.parse(value));
    if (key === 'brokerCommissionPct') { const r = rateOrNull(value); if (r != null) out.brokerCommissionPct = r; }
    if (key === 'low52Alerts') { if (value === 'on') out.low52Alerts = true; else if (value === 'off') out.low52Alerts = false; }
  }
  return out;
}

export function prefsToRows(p: Prefs): string[][] {
  return [
    ...(p.watchlist ? [['watchlist', JSON.stringify(p.watchlist)]] : []),
    ...(p.brokerCommissionPct != null ? [['brokerCommissionPct', p.brokerCommissionPct]] : []),
    ...(p.alertRules ? [['alertRules', JSON.stringify(p.alertRules)]] : []),
    ...(p.rangeRules ? [['rangeRules', JSON.stringify(p.rangeRules)]] : []),
    ...(p.low52Alerts !== undefined ? [['low52Alerts', p.low52Alerts ? 'on' : 'off']] : []),
  ];
}

// Request body check: null means refuse the whole save.
export function parsePrefs(input: unknown): Prefs | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const rate = o.brokerCommissionPct === undefined ? undefined : rateOrNull(o.brokerCommissionPct);
  // A save always sends every value, so a partial or empty body can never erase another one.
  if (rate === null || rate === undefined || !Array.isArray(o.watchlist) || !Array.isArray(o.alertRules) || (o.rangeRules !== undefined && !Array.isArray(o.rangeRules)) || (o.low52Alerts !== undefined && typeof o.low52Alerts !== 'boolean')) return null;
  return { watchlist: parseWatchlist(JSON.stringify(o.watchlist)), brokerCommissionPct: rate, alertRules: parseAlertRules(o.alertRules), ...(Array.isArray(o.rangeRules) ? { rangeRules: parseRangeRules(o.rangeRules) } : {}), ...(o.low52Alerts !== undefined ? { low52Alerts: o.low52Alerts as boolean } : {}) };
}
