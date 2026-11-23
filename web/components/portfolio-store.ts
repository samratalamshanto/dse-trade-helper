'use client';

import { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import { call, checkSignIn, ensureKey, KEY_STORE, SHEET_URL_STORE, sheetKey, SIGNED_IN_STORE, type TradesList } from '@/components/trades-client';
import { readStored, useStoredValue, writeStored } from '@/components/useStored';
import type { PlansList } from '@/components/planner/plan-text';
import { dhakaToday } from '@/lib/dhaka';
import { encodeAlertStore, parseAlertStore } from '@/lib/alerts';
import { mergeData, toBackup, type Backup, type MyData } from '@/lib/backup';
import { splitPlans, splitTrades, type Split } from '@/lib/browser-data';
import { MAX_BROWSER_PLANS, validatePlan, type SavedPlan } from '@/lib/plans';
import { parseWatchlist } from '@/lib/watchlist';
import { PREFS_SYNCED_STORE } from '@/lib/prefs';
import { parseSettings, settingsFromRows, type LimitSettings } from '@/lib/positions';
import { MAX_BROWSER_TRADES, splitNew, validateTrade, type Account, type Trade, type TradeInput } from '@/lib/trades';

// One source at a time: this browser stores (the server still does the maths, /api/portfolio/*), or the Sheet when a key is saved.
export type Mode = 'browser' | 'sheet';
export interface ImportResult { date: string; added: TradeInput[]; skipped: TradeInput[]; errors: string[]; saved: boolean }

const TRADES_STORE = 'myTrades';
const PLANS_STORE = 'myPlans';
const LIMITS_STORE = 'myLimits';

export function useMode(): { mode: Mode; ready: boolean } {
  const [key] = useStoredValue(KEY_STORE, '');
  const [signedIn] = useStoredValue(SIGNED_IN_STORE, '');
  const [checked, setChecked] = useState(false);
  // Until the Google session check and (owner's localhost) ensureKey() answer, the mode is not known.
  useEffect(() => { void Promise.all([ensureKey(), checkSignIn()]).then(() => setChecked(true)); }, []);
  const sheet = !!key || signedIn === '1';
  return { mode: sheet ? 'sheet' : 'browser', ready: checked || sheet };
}

const SAVE_FAILED = 'Could not save in this browser (storage is full or blocked). Export a copy or turn on Google Sheet sync.';
const UNREADABLE = 'Some data saved in this browser could not be read. Use the note at the top of Portfolio first.';

// Unlike settings, trades must never live only in memory: a failed write is an error the user sees.
function save(store: string, v: string): void {
  try { localStorage.setItem(store, v); } catch (e) { console.warn(`${store}: not saved in this browser`, e); throw new Error(SAVE_FAILED); }
  writeStored(store, v);
}

export interface Saved<T> { good: T[]; bad: unknown[]; unreadable: string | null }
// Unreadable JSON or items keep the rest usable; they stay saved until the user downloads or removes them.
function readSaved<T>(raw: string | null, split: (list: unknown[]) => Split<T>): Saved<T> {
  if (!raw) return { good: [], bad: [], unreadable: null };
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { good: [], bad: [], unreadable: raw }; }
  return Array.isArray(v) ? { ...split(v), unreadable: null } : { good: [], bad: [], unreadable: raw };
}
const savedTrades = () => readSaved(readStored(TRADES_STORE), splitTrades);
const savedPlans = () => readSaved(readStored(PLANS_STORE), splitPlans);
function keepBad<T>(store: string, saved: Saved<T>, next: readonly T[]): void {
  if (saved.unreadable != null) throw new Error(UNREADABLE);
  save(store, JSON.stringify([...saved.bad, ...next]));
}
const writeTrades = (next: readonly Trade[]) => keepBad(TRADES_STORE, savedTrades(), next);
const writePlans = (next: readonly SavedPlan[]) => keepBad(PLANS_STORE, savedPlans(), next);
const browserTrades = () => savedTrades().good;
const browserPlans = () => savedPlans().good;
const limitsIn = (raw: string | null): LimitSettings | null => { try { return parseSettings(JSON.parse(raw ?? 'null')); } catch { return null; } };
const browserLimits = (): LimitSettings => limitsIn(readStored(LIMITS_STORE)) ?? settingsFromRows([]);

const post = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const now = () => new Date().toISOString();

function checkedTrade(input: unknown): TradeInput {
  const v = validateTrade(input);
  if (!v.ok) throw new Error(v.error);
  return v.value;
}

function checkedPlan(input: unknown) {
  const v = validatePlan(input);
  if (!v.ok) throw new Error(v.error);
  return v.value;
}

const stamp = (t: TradeInput, source: string): Trade => ({ ...t, id: crypto.randomUUID(), source, createdAt: now() });
const roomFor = (n: number, have: number, max: number, what: string) => { if (have + n > max) throw new Error(`This browser can keep at most ${max} ${what}. Turn on Google Sheet sync to keep more.`); };

export interface BrowserData { trades: Saved<Trade>; plans: Saved<SavedPlan>; hasLimits: boolean }

export function useBrowserData(): BrowserData {
  const [rawTrades] = useStoredValue(TRADES_STORE, '');
  const [rawPlans] = useStoredValue(PLANS_STORE, '');
  const [rawLimits] = useStoredValue(LIMITS_STORE, '');
  return useMemo(() => ({ trades: readSaved(rawTrades, splitTrades), plans: readSaved(rawPlans, splitPlans), hasLimits: limitsIn(rawLimits) != null }), [rawTrades, rawPlans, rawLimits]);
}

// "Remove them" / "Start empty": keeps the readable items and drops the rest.
export function dropUnreadable(which: 'trades' | 'plans'): void {
  const saved = which === 'trades' ? savedTrades() : savedPlans();
  save(which === 'trades' ? TRADES_STORE : PLANS_STORE, JSON.stringify(saved.good));
}

export async function listTrades(account: Account = 'real'): Promise<TradesList> {
  const key = sheetKey();
  if (key != null) return call<TradesList>(key, account === 'paper' ? '/api/trades?account=paper' : '/api/trades');
  const trades = browserTrades().filter((t) => (t.account ?? 'real') === account);
  const settings = browserLimits();
  if (!trades.length) return { trades: [], holdings: [], warnings: [], badRows: [], settings };
  return call<TradesList>('', '/api/portfolio/value', post({ trades, settings, account }));
}

// form: the Add/Edit trade fields as typed, with account.
export async function saveTrade(form: Record<string, string>, id: string | null = null): Promise<void> {
  const key = sheetKey();
  if (key != null) { await call(key, id ? `/api/trades/${id}` : '/api/trades', post(form, id ? 'PUT' : 'POST')); return; }
  const list = browserTrades();
  if (!id) {
    roomFor(1, list.length, MAX_BROWSER_TRADES, 'trades');
    writeTrades([...list, stamp(checkedTrade(form), 'manual')]);
    return;
  }
  const old = list.find((t) => t.id === id);
  if (!old) throw new Error('That trade no longer exists. Reload the list.');
  const value = checkedTrade('account' in form ? form : { ...form, account: old.account });
  writeTrades(list.map((t) => (t.id === id ? { ...value, id, source: old.source, createdAt: old.createdAt } : t)));
}

export async function deleteTrade(id: string): Promise<void> {
  const key = sheetKey();
  if (key != null) { await call(key, `/api/trades/${id}`, { method: 'DELETE' }); return; }
  writeTrades(browserTrades().filter((t) => t.id !== id));
}

export async function saveLimits(s: LimitSettings): Promise<void> {
  const key = sheetKey();
  if (key != null) { await call(key, '/api/trades/settings', post(s, 'PUT')); return; }
  const settings = parseSettings(s);
  if (!settings) throw new Error('Stop-loss and target must be percentages between 1 and 95.');
  save(LIMITS_STORE, JSON.stringify(settings));
}

// Browser mode: the server only reads the file; a trade already in this browser cancels one identical row (same rule as the Sheet).
export async function importFile(file: File, date: string, save: boolean, commissionPct = ''): Promise<ImportResult> {
  const key = sheetKey();
  const body = new FormData();
  body.append('file', file);
  if (date) body.append('date', date);
  if (commissionPct) body.append('commissionPct', commissionPct);
  if (key != null) {
    if (save) body.append('save', '1');
    return call<ImportResult>(key, '/api/trades/import', { method: 'POST', body });
  }
  const parsed = await call<{ date: string; trades: TradeInput[]; errors: string[] }>('', '/api/portfolio/import', { method: 'POST', body });
  const list = browserTrades();
  const { added, skipped } = splitNew(parsed.trades, list.filter((t) => (t.account ?? 'real') === 'real'));
  if (save && added.length) {
    roomFor(added.length, list.length, MAX_BROWSER_TRADES, 'trades');
    writeTrades([...list, ...added.map((t) => stamp(t, 'broker-xlsx'))]);
  }
  return { date: parsed.date, added, skipped, errors: parsed.errors, saved: save && added.length > 0 };
}

export async function listPlans(): Promise<PlansList> {
  const key = sheetKey();
  if (key != null) return call<PlansList>(key, '/api/plans');
  const plans = browserPlans();
  if (!plans.length) return { plans: [], badRows: [] };
  return call<PlansList>('', '/api/portfolio/plans', post({ plans, trades: browserTrades().filter((t) => (t.account ?? 'real') === 'real') }));
}

// draft: the plan form fields (PlanDraft), new or edited.
export async function savePlan(draft: object, id: string | null = null): Promise<void> {
  const key = sheetKey();
  if (key != null) { await call(key, id ? `/api/plans/${id}` : '/api/plans', post(draft, id ? 'PUT' : 'POST')); return; }
  const list = browserPlans();
  const value = checkedPlan(draft);
  if (!id) {
    roomFor(1, list.length, MAX_BROWSER_PLANS, 'plans');
    writePlans([...list, { ...value, id: crypto.randomUUID(), createdAt: now() }]);
    return;
  }
  const old = list.find((p) => p.id === id);
  if (!old) throw new Error('That plan no longer exists. Reload the list.');
  writePlans(list.map((p) => (p.id === id ? { ...value, id, createdAt: old.createdAt } : p)));
}

export async function deletePlan(id: string): Promise<void> {
  const key = sheetKey();
  if (key != null) { await call(key, `/api/plans/${id}`, { method: 'DELETE' }); return; }
  writePlans(browserPlans().filter((p) => p.id !== id));
}

// For "Plan a buy": the key path lets the server read the holding itself; otherwise (browser, Google sign-in) the holding is sent along.
export async function holdingQuery(code: string): Promise<string> {
  if (sheetKey()) return '';
  const { holdings } = await listTrades('real');
  const held = holdings.filter((h) => h.shares > 0);
  const h = held.find((x) => x.code === code);
  const portfolioValue = held.reduce((a, x) => a + (x.value ?? x.shares * x.avgCost), 0);
  return `&shares=${h?.shares ?? 0}&avgCost=${h?.avgCost ?? 0}&portfolioValue=${portfolioValue}`;
}

// Connect: the key is tried on the Sheet first, and saved only when it works.
export async function connectSheet(key: string): Promise<void> {
  await call<TradesList>(key, '/api/trades');
  writeStored(KEY_STORE, key);
  writeStored(STOPPED_STORE, '');
  writeStored(PREFS_SYNCED_STORE, '');
}

// A later connect (maybe to another Sheet) merges the watchlist again instead of replacing it.
export const disconnectSheet = (): void => { writeStored(KEY_STORE, ''); writeStored(PREFS_SYNCED_STORE, ''); };

// A key the Sheet now refuses (401): back to this browser, with a note so it does not look like lost data.
const STOPPED_STORE = 'sheetKeyStopped';
export function dropRefusedKey(): void {
  // Google refused the saved sign-in: end the session so the page offers "Continue with Google" again.
  if (readStored(SIGNED_IN_STORE) === '1') { writeStored(SIGNED_IN_STORE, ''); writeStored(SHEET_URL_STORE, ''); void signOut({ redirect: false }); return; }
  writeStored(STOPPED_STORE, '1');
  disconnectSheet();
}
export function useKeyStopped(): boolean {
  const [stopped] = useStoredValue(STOPPED_STORE, '');
  const [key] = useStoredValue(KEY_STORE, '');
  return stopped === '1' && !key;
}

// One normal POST per item, sent with its browser id: the Sheet skips an id it already has, so a retry never adds it twice.
// Each item leaves this browser right after it is saved; if that removal fails the move stops.
export async function moveBrowserDataToSheet(): Promise<void> {
  const key = sheetKey();
  if (key == null) throw new Error('Connect your Google Sheet first.');
  const today = dhakaToday();
  for (const t of browserTrades()) {
    await call(key, '/api/trades', post({ id: t.id, date: t.date, code: t.code, side: t.side, quantity: String(t.quantity), price: String(t.price), commission: t.commission == null ? '' : String(t.commission), note: t.note, account: t.account ?? 'real' }));
    writeTrades(browserTrades().filter((x) => x.id !== t.id));
  }
  for (const p of browserPlans()) {
    // The Sheet refuses a new active plan whose end date has passed; it moves without the end date instead of blocking the move.
    const until = p.status === 'active' && p.until && p.until < today ? '' : p.until ?? '';
    await call(key, '/api/plans', post({ id: p.id, createdAt: p.createdAt, code: p.code, quantity: String(p.quantity), boughtNow: String(p.boughtNow), targetPrice: p.targetPrice == null ? '' : String(p.targetPrice), until, note: p.note, status: p.status }));
    writePlans(browserPlans().filter((x) => x.id !== p.id));
  }
  const limits = limitsIn(readStored(LIMITS_STORE));
  if (limits) {
    await call(key, '/api/trades/settings', post(limits, 'PUT'));
    save(LIMITS_STORE, '');
  }
}

const browserExtras = () => ({ watchlist: parseWatchlist(readStored('watchlist')), alerts: parseAlertStore(readStored('alerts')) });

// Everything this browser shows: in sheet mode the trades and plans come from the Sheet.
export async function exportData(): Promise<Backup> {
  if (sheetKey() == null) return toBackup({ trades: browserTrades(), plans: browserPlans(), limits: limitsIn(readStored(LIMITS_STORE)), ...browserExtras() });
  const [real, paper, plans] = await Promise.all([listTrades('real'), listTrades('paper'), listPlans()]);
  return toBackup({ trades: splitTrades([...real.trades, ...paper.trades]).good, plans: splitPlans(plans.plans).good, limits: real.settings ?? null, ...browserExtras() });
}

// Browser mode only. All keys are written, or on a failed write the old values are put back.
export function importData(file: MyData, how: 'add' | 'replace'): void {
  if (sheetKey() != null) throw new Error('Import works with Google Sheet sync off. Disconnect, import, then move it into the Sheet.');
  const trades = savedTrades(), plans = savedPlans();
  if (how === 'add' && (trades.unreadable != null || plans.unreadable != null)) throw new Error(UNREADABLE);
  const merged = mergeData({ trades: trades.good, plans: plans.good, limits: limitsIn(readStored(LIMITS_STORE)), ...browserExtras() }, file, how);
  if (!merged.ok) throw new Error(merged.error);
  const m = merged.value;
  const keep = (bad: unknown[]) => (how === 'add' ? bad : []);
  const writes: [string, string][] = [
    [TRADES_STORE, JSON.stringify([...keep(trades.bad), ...m.trades])], [PLANS_STORE, JSON.stringify([...keep(plans.bad), ...m.plans])],
    [LIMITS_STORE, m.limits ? JSON.stringify(m.limits) : ''], ['watchlist', JSON.stringify(m.watchlist)], ['alerts', encodeAlertStore(m.alerts)],
  ];
  const before = writes.map(([k]) => readStored(k));
  try {
    for (const [k, v] of writes) save(k, v);
  } catch (e) {
    writes.forEach(([k], i) => writeStored(k, before[i] ?? ''));
    throw e;
  }
}
