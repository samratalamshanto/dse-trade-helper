import { CODE_RE, dhakaToday } from './dhaka.ts';

export const TRADE_COLUMNS = ['id', 'date', 'code', 'side', 'quantity', 'price', 'commission', 'note', 'source', 'created_at'] as const;
export const MAX_QUANTITY = 10_000_000;
export const MAX_PRICE = 1_000_000;
export const NOTE_MAX = 200;

export type Side = 'BUY' | 'SELL';

export interface TradeInput {
  date: string;
  code: string;
  side: Side;
  quantity: number;
  price: number;
  commission: number | null;
  note: string;
}

export interface Trade extends TradeInput {
  id: string;
  source: string;
  createdAt: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const NUMBER_RE = /^\d+(\.\d+)?$/;

export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[,৳\s]/g, '');
  return NUMBER_RE.test(s) ? Number(s) : null;
}

const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

// Notes are stored as plain text; a leading = + - @ would become a formula when the sheet is exported to Excel.
const cleanNote = (raw: unknown) => (typeof raw === 'string' ? raw : '').replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, NOTE_MAX);

export function validateTrade(input: unknown, today = dhakaToday()): Result<TradeInput> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Send a trade with date, code, side, quantity and price.' };
  const t = input as Record<string, unknown>;
  const date = typeof t.date === 'string' ? t.date.trim() : '';
  if (!isRealDate(date)) return { ok: false, error: 'Date must be a real date like 2026-11-19.' };
  if (date > today) return { ok: false, error: 'The trade date cannot be in the future.' };
  const code = typeof t.code === 'string' ? t.code.trim().toUpperCase() : '';
  if (!CODE_RE.test(code)) return { ok: false, error: 'Trade code is not valid.' };
  const side = typeof t.side === 'string' ? t.side.trim().toUpperCase() : '';
  if (side !== 'BUY' && side !== 'SELL') return { ok: false, error: 'Side must be BUY or SELL.' };
  const quantity = parseAmount(t.quantity);
  if (quantity == null || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return { ok: false, error: 'Quantity must be a whole number of shares, 1 or more.' };
  const price = parseAmount(t.price);
  if (price == null || price <= 0 || price > MAX_PRICE) return { ok: false, error: 'Price must be a positive amount in taka.' };
  const commissionRaw = t.commission;
  const commission = commissionRaw == null || commissionRaw === '' ? null : parseAmount(commissionRaw);
  if (commissionRaw != null && commissionRaw !== '' && commission == null) return { ok: false, error: 'Commission must be an amount in taka, or empty.' };
  return { ok: true, value: { date, code, side, quantity, price, commission, note: cleanNote(t.note) } };
}

export const dedupeKey = (t: Pick<TradeInput, 'date' | 'code' | 'side' | 'quantity' | 'price'>) => `${t.date}|${t.code}|${t.side}|${t.quantity}|${t.price.toFixed(4)}`;

// Each trade already in the sheet cancels one identical incoming row, so two real identical trades in one file both count.
export function splitNew(incoming: readonly TradeInput[], existing: readonly TradeInput[]): { added: TradeInput[]; skipped: TradeInput[] } {
  const left = new Map<string, number>();
  for (const t of existing) left.set(dedupeKey(t), (left.get(dedupeKey(t)) ?? 0) + 1);
  const added: TradeInput[] = [];
  const skipped: TradeInput[] = [];
  for (const t of incoming) {
    const n = left.get(dedupeKey(t)) ?? 0;
    if (n > 0) { skipped.push(t); left.set(dedupeKey(t), n - 1); } else added.push(t);
  }
  return { added, skipped };
}

export function toRow(t: Trade): string[] {
  return [t.id, t.date, t.code, t.side, String(t.quantity), String(t.price), t.commission == null ? '' : String(t.commission), t.note, t.source, t.createdAt];
}

export function fromRows(rows: string[][]): { trades: (Trade & { row: number })[]; badRows: number[] } {
  const trades: (Trade & { row: number })[] = [];
  const badRows: number[] = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.some((c) => c?.trim())) return;
    const [id, date, code, side, quantity, price, commission, note, source, createdAt] = r.map((c) => c ?? '');
    const v = validateTrade({ date, code, side, quantity, price, commission, note }, '9999-12-31');
    if (!id || !v.ok) badRows.push(row);
    else trades.push({ ...v.value, id, source, createdAt, row });
  });
  return { trades, badRows };
}

export interface Holding {
  code: string;
  shares: number;
  avgCost: number;
  invested: number;
  realised: number;
  trades: number;
}

// Average-cost method: commission is added to the cost of buys and taken from the proceeds of sells.
export function holdingsFrom(trades: readonly Trade[]): { holdings: Holding[]; warnings: string[] } {
  const sideOrder = (t: Trade) => (t.side === 'BUY' ? 0 : 1);
  // On the same day a buy is counted before a sell, whatever order they were typed in.
  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date) || sideOrder(a) - sideOrder(b) || a.createdAt.localeCompare(b.createdAt));
  const by = new Map<string, Holding>();
  const warnings: string[] = [];
  for (const t of ordered) {
    const h = by.get(t.code) ?? { code: t.code, shares: 0, avgCost: 0, invested: 0, realised: 0, trades: 0 };
    const fee = t.commission ?? 0;
    h.trades += 1;
    if (t.side === 'BUY') {
      h.invested += t.quantity * t.price + fee;
      h.shares += t.quantity;
    } else {
      const sold = Math.min(t.quantity, h.shares);
      if (sold < t.quantity) warnings.push(`${t.date} ${t.code}: sold ${t.quantity} but only ${h.shares} were bought before. Add the missing buy.`);
      const avg = h.shares ? h.invested / h.shares : 0;
      h.realised += sold * t.price - fee - sold * avg;
      h.invested -= sold * avg;
      h.shares -= sold;
    }
    h.avgCost = h.shares ? h.invested / h.shares : 0;
    by.set(t.code, h);
  }
  return { holdings: [...by.values()].sort((a, b) => a.code.localeCompare(b.code)), warnings };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function dateFromFileName(name: string): string | null {
  const m = /(\d{1,2})[-_ ]([A-Za-z]{3})[A-Za-z]*[-_ ](\d{4})/.exec(name);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isRealDate(iso) ? iso : null;
}

const BROKER_COLUMNS = { code: 'trade code', buyQty: 'bexecqty', buyPrice: 'bavgprice', sellQty: 'sexecqty', sellPrice: 'savgprice' } as const;

// Reads a broker "order summary" sheet: one row per company with executed buy/sell quantity and average price. The BO code column is never read.
export function parseOrderSummary(rows: string[][], date: string, today = dhakaToday()): { trades: TradeInput[]; errors: string[] } {
  const headerAt = rows.findIndex((r) => r.some((c) => c.toLowerCase() === BROKER_COLUMNS.code) && r.some((c) => c.toLowerCase() === BROKER_COLUMNS.buyQty));
  if (headerAt < 0) return { trades: [], errors: ['This is not a broker order summary: the "Trade Code" and "BExecQty" columns were not found.'] };
  const header = rows[headerAt].map((c) => c.toLowerCase());
  const col = Object.fromEntries(Object.entries(BROKER_COLUMNS).map(([k, name]) => [k, header.indexOf(name)])) as Record<keyof typeof BROKER_COLUMNS, number>;
  const trades: TradeInput[] = [];
  const errors: string[] = [];
  const note = `from order summary ${date}`;
  rows.slice(headerAt + 1).forEach((r, i) => {
    const code = (r[col.code] ?? '').trim().toUpperCase();
    if (!code || code === 'TOTAL') return;
    for (const [side, q, p] of [['BUY', col.buyQty, col.buyPrice], ['SELL', col.sellQty, col.sellPrice]] as const) {
      if (q < 0) continue;
      const quantity = parseAmount(r[q] ?? '');
      if (!quantity) continue;
      const v = validateTrade({ date, code, side, quantity, price: p < 0 ? null : r[p], commission: null, note }, today);
      if (v.ok) trades.push(v.value);
      else errors.push(`Row ${headerAt + i + 2} (${code} ${side}): ${v.error}`);
    }
  });
  return { trades, errors };
}
