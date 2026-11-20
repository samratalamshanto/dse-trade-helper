import type { Trade, TradeInput } from '../../web/lib/trades.ts';
import { ApiError, getJson, type RequestOptions } from './api.ts';
import type { HoldingCheck, LimitSettings, Limits } from './checks.ts';

export type { Trade, TradeInput };

export interface HoldingRow {
  code: string;
  shares: number;
  avgCost: number;
  invested: number;
  realised: number;
  trades: number;
  price: number | null;
  value: number | null;
  unrealised: number | null;
  limits?: Limits;
  check?: HoldingCheck | null;
}

export interface TradesResponse { trades: Trade[]; holdings: HoldingRow[]; warnings: string[]; badRows: number[]; settings?: LimitSettings }
export interface ImportResult { date: string; added: TradeInput[]; skipped: TradeInput[]; errors: string[]; saved: boolean }
export interface PickedFile { uri: string; name: string; file?: Blob }

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const TRADES_KEY = process.env.EXPO_PUBLIC_TRADES_KEY;

export function friendlyTradesError(e: unknown): unknown {
  if (!(e instanceof ApiError)) return e;
  if (e.status === 401) return new ApiError('Enter the trades key: set EXPO_PUBLIC_TRADES_KEY in app/.env and restart Expo.', 401, { cause: e });
  if (e.status === 503) return new ApiError('Trades are not set up on the server.', 503, { cause: e });
  return e;
}

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await getJson<T>(API_URL, path, fetch, { ...options, headers: { ...options.headers, 'x-trades-key': TRADES_KEY ?? '' } });
  } catch (e) {
    throw friendlyTradesError(e);
  }
}

const sendJson = <T>(method: string, path: string, body: unknown) => call<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const loadTrades = (path: string) => call<TradesResponse>(path);

export const saveTrade = (id: string | null, input: TradeInput) =>
  id ? sendJson<Trade>('PUT', `/api/trades/${encodeURIComponent(id)}`, input) : sendJson<Trade>('POST', '/api/trades', input);

export const saveLimits = (settings: LimitSettings) => sendJson<LimitSettings>('PUT', '/api/trades/settings', settings);

export const deleteTrade = (id: string) => call<{ deleted: true }>(`/api/trades/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Without save the server only previews the rows; save=1 writes them.
// The caller passes the file as a real Blob: SDK 58 fetch rejects the old React Native { uri, name, type } upload object.
export function importOrderSummary(file: { blob: Blob; name: string }, save: boolean, date?: string): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file.blob, file.name);
  form.append('fileName', file.name);
  if (date) form.append('date', date);
  if (save) form.append('save', '1');
  return call<ImportResult>('/api/trades/import', { method: 'POST', body: form });
}

export function groupByDate<T extends { date: string }>(trades: readonly T[]): { title: string; data: T[] }[] {
  const groups: { title: string; data: T[] }[] = [];
  for (const t of trades) {
    const last = groups[groups.length - 1];
    if (last?.title === t.date) last.data.push(t);
    else groups.push({ title: t.date, data: [t] });
  }
  return groups;
}

// Unrealised P/L counts only open holdings with a live price; `unpriced` says how many were left out.
export function holdingTotals(holdings: readonly HoldingRow[]) {
  const open = holdings.filter((h) => h.shares > 0);
  const priced = open.filter((h): h is HoldingRow & { value: number } => h.value != null);
  const value = priced.reduce((n, h) => n + h.value, 0);
  const cost = priced.reduce((n, h) => n + h.invested, 0);
  return {
    value,
    unrealised: value - cost,
    unrealisedPct: cost > 0 ? ((value - cost) / cost) * 100 : null,
    realised: holdings.reduce((n, h) => n + h.realised, 0),
    unpriced: open.length - priced.length,
  };
}
