import { randomUUID } from 'node:crypto';
import { dhakaToday } from './dhaka.ts';
import { livePrices } from './dse.ts';
import { checkPosition, parseSettings, settingsFromRows, settingsToRows, type LimitSettings } from './positions.ts';
import { companyDetail } from './service.ts';
import { appendRows, deleteRow, readRows, readSettingsRows, SheetsError, writeRow, writeSettingsRows } from './sheets.ts';
import { dateFromFileName, fromRows, holdingsFrom, parseOrderSummary, splitNew, toRow, type Account, type Trade, type TradeInput, validateTrade } from './trades.ts';
import { readFirstSheet } from './xlsx.ts';

export class TradeInputError extends Error {}

let queue: Promise<unknown> = Promise.resolve();
// Sheet writes run one at a time so a duplicate check and the write that follows cannot interleave.
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};

const stamp = (input: TradeInput, source: string): Trade => ({ ...input, id: randomUUID(), source, createdAt: new Date().toISOString() });

async function current(account: Account | 'all' = 'real') {
  return fromRows(await readRows(), account);
}

export async function listTrades(account: Account = 'real') {
  const { trades, badRows } = await current(account);
  const { holdings, warnings } = holdingsFrom(trades);
  // Limits are read beside the prices; a settings-tab failure falls back to the defaults instead of failing the list.
  const limitsOrDefaults = readLimits().catch((e: unknown) => { console.warn('trades: limits unavailable, using defaults', e); return settingsFromRows([]); });
  const live = await livePrices().catch((e: unknown) => { console.warn('trades: live prices unavailable', e); return {} as Record<string, { ltp: number }>; });
  const valued = holdings.filter((h) => h.shares > 0 || h.realised !== 0).map((h) => {
    const price = live[h.code]?.ltp || null;
    const value = price != null ? price * h.shares : null;
    return { ...h, price, value, unrealised: value != null ? value - h.invested : null };
  });
  const settings = await limitsOrDefaults;
  const total = valued.reduce((a, h) => a + (h.value ?? 0), 0);
  const today = dhakaToday();
  const checkedHoldings = await Promise.all(valued.map(async (h) => {
    const limits = settings.perCode[h.code] ?? settings.default;
    if (h.shares <= 0) return { ...h, limits, check: null };
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
  return { account, trades: sorted, holdings: checkedHoldings, warnings, badRows, settings };
}

function checked(input: unknown): TradeInput {
  const v = validateTrade(input);
  if (!v.ok) throw new TradeInputError(v.error);
  return v.value;
}

export const addTrade = (input: unknown) => serial(async () => {
  const trade = stamp(checked(input), 'manual');
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

export const importOrderSummary = (data: Uint8Array, fileName: string, dateOverride: string | null, save: boolean) => serial(async (): Promise<ImportResult> => {
  const date = dateOverride || dateFromFileName(fileName);
  if (!date) throw new TradeInputError('The trade date could not be read from the file name. Pick the date and upload again.');
  // Broker files are real trades: parseOrderSummary never sets an account, so validateTrade makes each one 'real'.
  const { trades, errors } = parseOrderSummary(readFirstSheet(data), date);
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
