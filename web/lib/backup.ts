import { parseAlertStore, type AlertStore } from './alerts.ts';
import { splitPlans, splitTrades } from './browser-data.ts';
import { MAX_BROWSER_PLANS, type SavedPlan } from './plans.ts';
import { parseSettings, type LimitSettings } from './positions.ts';
import { MAX_BROWSER_TRADES, splitNew, type Trade } from './trades.ts';
import { parseWatchlist } from './watchlist.ts';

export const BACKUP_APP = 'trade-helper';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 3_000_000;

export interface MyData { trades: Trade[]; plans: SavedPlan[]; limits: LimitSettings | null; watchlist: string[]; alerts: AlertStore }
export interface Backup extends MyData { app: typeof BACKUP_APP; version: typeof BACKUP_VERSION; exportedAt: string }

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const toBackup = (d: MyData, now = new Date()): Backup => ({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...d });

// Every item is checked before anything is written; one bad item refuses the whole file, so an import is never half done.
export function parseBackup(text: string): Result<MyData> {
  if (text.length > BACKUP_MAX_BYTES) return { ok: false, error: 'This file is too large to be a Trade Helper backup.' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This is not a Trade Helper backup file.' }; }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (b.app !== BACKUP_APP) return { ok: false, error: 'This is not a Trade Helper backup file.' };
  if (b.version !== BACKUP_VERSION) return { ok: false, error: 'This backup was made by a different version of Trade Helper and cannot be read here.' };
  const list = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : null);
  const tradeList = list(b.trades), planList = list(b.plans);
  if (!tradeList || !planList) return { ok: false, error: 'The trades or plans in this file are damaged.' };
  if (tradeList.length > MAX_BROWSER_TRADES || planList.length > MAX_BROWSER_PLANS) return { ok: false, error: `A backup can hold at most ${MAX_BROWSER_TRADES} trades and ${MAX_BROWSER_PLANS} plans.` };
  const trades = splitTrades(tradeList), plans = splitPlans(planList);
  if (trades.bad.length) return { ok: false, error: `Trade ${tradeList.indexOf(trades.bad[0]) + 1} in this file is not valid. Nothing was imported.` };
  if (plans.bad.length) return { ok: false, error: `Plan ${planList.indexOf(plans.bad[0]) + 1} in this file is not valid. Nothing was imported.` };
  // Two items with one id would make Edit and Delete hit both, so such a file is refused.
  const dupe = (ids: string[]) => ids.length !== new Set(ids).size;
  if (dupe(trades.good.map((t) => t.id)) || dupe(plans.good.map((p) => p.id))) return { ok: false, error: 'This file has the same trade or plan twice. Nothing was imported.' };
  const limits = b.limits == null ? null : parseSettings(b.limits);
  if (b.limits != null && !limits) return { ok: false, error: 'The limits in this file are not valid. Nothing was imported.' };
  return { ok: true, value: { trades: trades.good, plans: plans.good, limits, watchlist: parseWatchlist(JSON.stringify(b.watchlist ?? [])), alerts: parseAlertStore(JSON.stringify(b.alerts ?? {})) } };
}

// "Add": nothing already here is changed; a trade with a known id, or one identical to a trade here (splitNew rule), is skipped.
export function mergeData(here: MyData, file: MyData, how: 'add' | 'replace'): Result<MyData> {
  if (how === 'replace') return { ok: true, value: file };
  const ids = new Set(here.trades.map((t) => t.id));
  const fresh = file.trades.filter((t) => !ids.has(t.id));
  const added = new Set(splitNew(fresh, here.trades).added);
  const planIds = new Set(here.plans.map((p) => p.id));
  const ruleIds = new Set(here.alerts.rules.map((r) => r.id));
  const merged: MyData = {
    trades: [...here.trades, ...fresh.filter((t) => added.has(t))],
    plans: [...here.plans, ...file.plans.filter((p) => !planIds.has(p.id))],
    limits: here.limits ?? file.limits,
    watchlist: parseWatchlist(JSON.stringify([...here.watchlist, ...file.watchlist])),
    alerts: { ...here.alerts, rules: [...here.alerts.rules, ...file.alerts.rules.filter((r) => !ruleIds.has(r.id))] },
  };
  if (merged.trades.length > MAX_BROWSER_TRADES || merged.plans.length > MAX_BROWSER_PLANS) return { ok: false, error: `Together that is more than ${MAX_BROWSER_TRADES} trades or ${MAX_BROWSER_PLANS} plans. Use "Replace" instead, or turn on Google Sheet sync.` };
  return { ok: true, value: merged };
}

export function backupSummary(d: MyData): string {
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  return [n(d.trades.length, 'trade', 'trades'), n(d.plans.length, 'plan', 'plans'), ...(d.limits ? ['limits'] : []), n(d.watchlist.length, 'watchlist code', 'watchlist codes'), n(d.alerts.rules.length, 'alert', 'alerts')].join(', ');
}
