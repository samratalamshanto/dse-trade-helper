import { randomUUID } from 'node:crypto';
import { dhakaToday } from './dhaka.ts';
import { livePrices } from './dse.ts';
import { checkPosition, parseSettings, settingsFromRows, settingsToRows, type LimitSettings } from './positions.ts';
import { companyDetail } from './service.ts';
import { allCompanies } from './store.ts';
import { appendRows, deleteRow, readRows, readSettingsRows, serialPerSheet, SheetsError, writeRow, writeSettingsRows, type TabSpec } from './sheets.ts';
import { parsePrefs, PREFS_COLUMNS, prefsFromRows, prefsToRows, type Prefs } from './prefs.ts';
import { dateFromFileName, fromRows, MAX_COMMISSION_PCT, TRADE_ID_RE, TradeInputError, holdingsFrom, parseOrderSummary, splitNew, toRow, type Account, type Trade, type TradeInput, validateTrade } from './trades.ts';
import { readFirstSheet } from './xlsx.ts';

export { TradeInputError };

// Sheet writes run one at a time per Sheet so a duplicate check and the write that follows cannot interleave.
const serial = serialPerSheet();

const stamp = (input: TradeInput, source: string): Trade => ({ ...input, id: randomUUID(), source, createdAt: new Date().toISOString() });

async function current(account: Account | 'all' = 'real') {
  return fromRows(await readRows(), account);
}

export async function listTrades(account: Account = 'real') {
  // Limits are read beside the trades; a settings-tab failure falls back to the defaults instead of failing the list.
  const [{ trades, badRows }, settings] = await Promise.all([
    current(account),
    readLimits().catch((e: unknown) => { console.warn('trades: limits unavailable, using defaults', e); return settingsFromRows([]); }),
  ]);
  return valueTrades(trades, settings, account, badRows);
}

const MAX_CHECKED = 150;

// One valuation for both sources: the Google Sheet and the trades a browser sends (lib/browser-data.ts).
export async function valueTrades(trades: readonly Trade[], settings: LimitSettings, account: Account, badRows: number[] = []) {
  const { holdings, warnings } = holdingsFrom(trades);
  const live = await livePrices().catch((e: unknown) => { console.warn('trades: live prices unavailable', e); return {} as Record<string, { ltp: number }>; });
  const valued = holdings.filter((h) => h.shares > 0 || h.realised !== 0).map((h) => {
    const price = live[h.code]?.ltp || null;
    const value = price != null ? price * h.shares : null;
    return { ...h, price, value, unrealised: value != null ? value - h.invested : null };
  });
  const total = valued.reduce((a, h) => a + (h.value ?? 0), 0);
  const today = dhakaToday();
  // A browser body can name thousands of codes: only listed companies are analysed, and at most MAX_CHECKED of them.
  const stored = allCompanies();
  const toCheck = new Set(valued.filter((h) => h.shares > 0 && (h.code in live || h.code in stored)).slice(0, MAX_CHECKED).map((h) => h.code));
  const unchecked = valued.filter((h) => h.shares > 0 && !toCheck.has(h.code)).length;
  const notes = unchecked ? [...warnings, `Checks are shown for ${toCheck.size} holdings; ${unchecked} more are not on the DSE list or past the first ${MAX_CHECKED}.`] : warnings;
  const checkedHoldings = await Promise.all(valued.map(async (h) => {
    const limits = settings.perCode[h.code] ?? settings.default;
    if (!toCheck.has(h.code)) return { ...h, limits, check: null };
    const detail = await companyDetail(h.code, false).catch((e: unknown) => { console.warn(`trades: no analysis for ${h.code}`, e); return null; });
    const up = detail?.dividend.upcoming;
    const check = checkPosition({
      shares: h.shares, avgCost: h.avgCost, price: h.price, weightPct: total > 0 && h.value != null ? (h.value / total) * 100 : null,
      signal: detail?.analysis.signal ?? null, fraud: detail?.analysis.fraud.level ?? null,
      zone: detail?.position.zone ?? null, verdictKey: detail?.position.verdict?.key ?? null,
      dividend: up ? { lastBuyDate: up.lastBuyDate ?? null, cashPct: up.cashPct ?? null } : null,
    }, limits, today);
    return { ...h, limits, check };
  }));
  const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map((t) => ({ id: t.id, date: t.date, code: t.code, side: t.side, quantity: t.quantity, price: t.price, commission: t.commission, note: t.note, source: t.source, createdAt: t.createdAt, account: t.account }));
  return { account, trades: sorted, holdings: checkedHoldings, warnings: notes, badRows, settings };
}

function checked(input: unknown): TradeInput {
  const v = validateTrade(input);
  if (!v.ok) throw new TradeInputError(v.error);
  return v.value;
}

// A browser item moved to the Sheet keeps its id, so a repeated move (lost answer, two tabs) finds it and adds nothing.
export const givenId = (input: unknown): string | null => {
  const id = input && typeof input === 'object' ? (input as { id?: unknown }).id : null;
  return typeof id === 'string' && TRADE_ID_RE.test(id) ? id : null;
};

export const addTrade = (input: unknown) => serial(async () => {
  const value = checked(input);
  const id = givenId(input);
  const existing = id ? (await current('all')).trades.find((t) => t.id === id) : undefined;
  if (existing) return existing;
  const trade = { ...stamp(value, 'manual'), ...(id ? { id } : {}) };
  await appendRows([toRow(trade)]);
  return trade;
});

async function rowOf(id: string) {
  const found = (await current('all')).trades.find((t) => t.id === id);
  if (!found) throw new SheetsError('That trade no longer exists. Reload the list.', 404);
  return found;
}

export const updateTrade = (id: string, input: unknown) => serial(async () => {
  const old = await rowOf(id);
  // An edit that does not name the account keeps the trade in its own account.
  const value = checked(input && typeof input === 'object' && !('account' in input) ? { ...input, account: old.account } : input);
  const trade: Trade = { ...value, id, source: old.source, createdAt: old.createdAt };
  await writeRow(old.row, toRow(trade));
  return trade;
});

export const deleteTrade = (id: string) => serial(async () => {
  await deleteRow((await rowOf(id)).row, id);
});

export interface ImportResult { date: string; added: TradeInput[]; skipped: TradeInput[]; errors: string[]; saved: boolean }

// Broker files are real trades: parseOrderSummary never sets an account, so validateTrade makes each one 'real'.
export function parseBrokerFile(data: Uint8Array, fileName: string, dateOverride: string | null, commissionPct = ''): { date: string; trades: TradeInput[]; errors: string[] } {
  const date = dateOverride || dateFromFileName(fileName);
  if (!date) throw new TradeInputError('The trade date could not be read from the file name. Pick the date and upload again.');
  return { date, ...parseOrderSummary(readFirstSheet(data), date, dhakaToday(), commissionPct) };
}

export const importOrderSummary = (data: Uint8Array, fileName: string, dateOverride: string | null, save: boolean, commissionPct = '') => serial(async (): Promise<ImportResult> => {
  const { date, trades, errors } = parseBrokerFile(data, fileName, dateOverride, commissionPct);
  const { added, skipped } = splitNew(trades, (await current()).trades);
  if (save && added.length) await appendRows(added.map((t) => toRow(stamp(t, 'broker-xlsx'))));
  return { date, added, skipped, errors, saved: save && added.length > 0 };
});

export async function readLimits(): Promise<LimitSettings> {
  return settingsFromRows(await readSettingsRows());
}

export const saveLimits = (input: unknown) => serial(async () => {
  const settings = parseSettings(input);
  if (!settings) throw new TradeInputError('Stop-loss and target must be percentages between 1 and 95.');
  await writeSettingsRows(settingsToRows(settings));
  return settings;
});

const PREFS_TAB: TabSpec = { title: 'prefs', columns: PREFS_COLUMNS };

export async function readPrefs(): Promise<Prefs> {
  return prefsFromRows(await readSettingsRows(PREFS_TAB));
}

export const savePrefs = (input: unknown) => serial(async () => {
  const parsed = parsePrefs(input);
  const needsSaved = parsed && (!parsed.rangeRules || parsed.low52Alerts === undefined);
  const savedPrefs = needsSaved ? await readPrefs() : null;
  // An older page sends no rangeRules: keep the saved ones instead of erasing them.
  const prefs = parsed ? { ...parsed, ...(!parsed.rangeRules ? { rangeRules: savedPrefs?.rangeRules ?? [] } : {}), ...(parsed.low52Alerts === undefined && savedPrefs?.low52Alerts !== undefined ? { low52Alerts: savedPrefs.low52Alerts } : {}) } : null;
  if (!prefs) throw new TradeInputError(`The watchlist and alert rules must be lists and the broker rate a percentage from 0 to ${MAX_COMMISSION_PCT}.`);
  await writeSettingsRows(prefsToRows(prefs), PREFS_TAB);
  return prefs;
});
