import { CODE_RE, dhakaToday } from './dhaka.ts';
import { MAX_PRICE, MAX_QUANTITY, NOTE_MAX, parseAmount } from './trades.ts';

export const PLAN_COLUMNS = ['id', 'code', 'quantity', 'bought_now', 'target_price', 'until', 'note', 'status', 'created_at'] as const;
export const PLAN_STATES = ['active', 'done', 'cancelled'] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export interface PlanInput { code: string; quantity: number; boughtNow: number; targetPrice: number | null; until: string | null; note: string; status: PlanState }
export interface SavedPlan extends PlanInput { id: string; createdAt: string }

export type LiveStatus = 'waiting' | 'reached' | 'expired' | 'done' | 'cancelled';
export interface PlanStatus { status: LiveStatus; remaining: number; awayPct: number | null; text: string }

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const cleanNote = (raw: unknown) => (typeof raw === 'string' ? raw : '').replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, NOTE_MAX);

export function validatePlan(input: unknown, today = dhakaToday()): Result<PlanInput> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Send a plan with code and quantity.' };
  const t = input as Record<string, unknown>;
  const code = typeof t.code === 'string' ? t.code.trim().toUpperCase() : '';
  if (!CODE_RE.test(code)) return { ok: false, error: 'Trade code is not valid.' };
  const quantity = parseAmount(t.quantity);
  if (quantity == null || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return { ok: false, error: 'Quantity must be a whole number of shares, 1 or more.' };
  const bought = t.boughtNow == null || t.boughtNow === '' ? 0 : parseAmount(t.boughtNow);
  if (bought == null || !Number.isSafeInteger(bought) || bought < 0) return { ok: false, error: 'Shares bought must be a whole number.' };
  // Bought comes from the trades now, so the only way to hit this is lowering the quantity below it.
  if (bought > quantity) return { ok: false, error: `You already bought ${bought} shares, so the quantity must be ${bought} or more.` };
  const rawTarget = t.targetPrice;
  const targetPrice = rawTarget == null || rawTarget === '' ? null : parseAmount(rawTarget);
  if (rawTarget != null && rawTarget !== '' && (targetPrice == null || targetPrice <= 0 || targetPrice > MAX_PRICE)) return { ok: false, error: 'Target price must be a positive amount in taka, or empty.' };
  if (bought < quantity && targetPrice == null) return { ok: false, error: 'Set a target price for the shares you have not bought yet.' };
  const status = t.status == null || t.status === '' ? 'active' : String(t.status);
  if (!(PLAN_STATES as readonly string[]).includes(status)) return { ok: false, error: 'Status must be active, done or cancelled.' };
  const until = typeof t.until === 'string' && t.until.trim() ? t.until.trim() : null;
  // Only an active plan needs a future end date; an old plan can still be marked done or cancelled.
  if (until != null && (!isRealDate(until) || (status === 'active' && until < today))) return { ok: false, error: 'The end date must be a real date, today or later.' };
  return { ok: true, value: { code, quantity, boughtNow: bought, targetPrice, until, note: cleanNote(t.note), status: status as PlanState } };
}

export function planToRow(p: SavedPlan): string[] {
  return [p.id, p.code, String(p.quantity), String(p.boughtNow), p.targetPrice == null ? '' : String(p.targetPrice), p.until ?? '', p.note, p.status, p.createdAt];
}

// Past end dates are allowed when reading back: an old plan simply shows as expired.
export function plansFromRows(rows: string[][]): { plans: (SavedPlan & { row: number })[]; badRows: number[] } {
  const plans: (SavedPlan & { row: number })[] = [];
  const badRows: number[] = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.some((c) => c?.trim())) return;
    const [id, code, quantity, boughtNow, targetPrice, until, note, status, createdAt] = r.map((c) => c ?? '');
    const v = validatePlan({ code, quantity, boughtNow, targetPrice, until, note, status }, '0000-01-01');
    if (!id || !v.ok) badRows.push(row);
    else plans.push({ ...v.value, id, createdAt, row });
  });
  return { plans, badRows };
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

// Shares of the plan's company bought on or after the plan day (Dhaka date), capped at the plan quantity.
// Pass real-account trades only; "bought" is read from the trades, never typed by hand.
export function boughtSince(p: { code: string; quantity: number; createdAt: string }, trades: { code: string; side: string; quantity: number; date: string }[]): number {
  const at = Date.parse(p.createdAt);
  const from = Number.isFinite(at) ? new Date(at + DHAKA_OFFSET_MS).toISOString().slice(0, 10) : '';
  const bought = trades.filter((t) => t.code === p.code && t.side === 'BUY' && t.date >= from).reduce((a, t) => a + t.quantity, 0);
  return Math.min(p.quantity, bought);
}

export function planStatus(p: PlanInput, price: number | null, today: string): PlanStatus {
  const remaining = p.quantity - p.boughtNow;
  if (p.status === 'done') return { status: 'done', remaining: 0, awayPct: null, text: 'Done' };
  if (p.status === 'cancelled') return { status: 'cancelled', remaining, awayPct: null, text: 'Cancelled' };
  if (remaining <= 0) return { status: 'done', remaining: 0, awayPct: null, text: 'All shares bought — mark it done' };
  if (p.until && p.until < today) return { status: 'expired', remaining, awayPct: null, text: `Ended ${p.until} — edit the date or cancel it` };
  if (price == null || p.targetPrice == null) return { status: 'waiting', remaining, awayPct: null, text: 'Waiting — no live price yet' };
  const awayPct = Math.round(((price - p.targetPrice) / p.targetPrice) * 1000) / 10;
  if (price <= p.targetPrice) return { status: 'reached', remaining, awayPct, text: `Target ৳${p.targetPrice.toFixed(2)} reached — buy the other ${remaining} now` };
  return { status: 'waiting', remaining, awayPct, text: `Waiting — ${awayPct.toFixed(1)}% above your ৳${p.targetPrice.toFixed(2)} target` };
}
