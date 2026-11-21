import { settingsFromRows, parseSettings, type LimitSettings } from './positions.ts';
import { MAX_BROWSER_PLANS, plansFromRows, type SavedPlan } from './plans.ts';
import { fromRows, MAX_BROWSER_TRADES, TradeInputError, type Account, type Trade } from './trades.ts';

// Browser objects are turned into sheet rows, so they pass exactly the checks a Sheet row passes (fromRows, plansFromRows).
const TRADE_FIELDS = ['id', 'date', 'code', 'side', 'quantity', 'price', 'commission', 'note', 'source', 'createdAt', 'account'] as const;
const PLAN_FIELDS = ['id', 'code', 'quantity', 'boughtNow', 'targetPrice', 'until', 'note', 'status', 'createdAt'] as const;

const cell = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const rowOf = (o: unknown, fields: readonly string[]): string[] => (o && typeof o === 'object' ? fields.map((f) => cell((o as Record<string, unknown>)[f])) : ['?']);

export interface Split<T> { good: T[]; bad: unknown[] }

// Used by the server routes and by the browser itself, so both agree on which saved items are readable.
export function splitTrades(raw: readonly unknown[]): Split<Trade> {
  const good: Trade[] = [];
  const bad: unknown[] = [];
  for (const o of raw) {
    const t = fromRows([rowOf(o, TRADE_FIELDS)], 'all').trades[0];
    if (t) good.push({ id: t.id, date: t.date, code: t.code, side: t.side, quantity: t.quantity, price: t.price, commission: t.commission, note: t.note, source: t.source, createdAt: t.createdAt, account: t.account });
    else bad.push(o);
  }
  return { good, bad };
}

export function splitPlans(raw: readonly unknown[]): Split<SavedPlan> {
  const good: SavedPlan[] = [];
  const bad: unknown[] = [];
  for (const o of raw) {
    const p = plansFromRows([rowOf(o, PLAN_FIELDS)]).plans[0];
    if (p) good.push({ id: p.id, code: p.code, quantity: p.quantity, boughtNow: p.boughtNow, targetPrice: p.targetPrice, until: p.until, note: p.note, status: p.status, createdAt: p.createdAt });
    else bad.push(o);
  }
  return { good, bad };
}

function listOf(raw: unknown, max: number, what: string): unknown[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new TradeInputError(`Send the ${what} as a list.`);
  if (raw.length > max) throw new TradeInputError(`Too many ${what}: at most ${max} can be kept in this browser.`);
  return raw;
}

const refuse = (raw: unknown[], bad: unknown[], what: string): never => { throw new TradeInputError(`${what} ${raw.indexOf(bad[0]) + 1} is not valid. Remove it or add it again.`); };

export function tradesFromBody(raw: unknown, account: Account): Trade[] {
  const list = listOf(raw, MAX_BROWSER_TRADES, 'trades');
  const { good, bad } = splitTrades(list);
  if (bad.length) refuse(list, bad, 'Trade');
  return good.filter((t) => t.account === account);
}

export function plansFromBody(raw: unknown): SavedPlan[] {
  const list = listOf(raw, MAX_BROWSER_PLANS, 'plans');
  const { good, bad } = splitPlans(list);
  if (bad.length) refuse(list, bad, 'Plan');
  return good;
}

export function settingsFromBody(raw: unknown): LimitSettings {
  if (raw == null) return settingsFromRows([]);
  const s = parseSettings(raw);
  if (!s) throw new TradeInputError('Stop-loss and target must be percentages between 1 and 95.');
  return s;
}

export function accountFromBody(raw: unknown): Account {
  if (raw == null || raw === 'real' || raw === 'paper') return (raw ?? 'real') as Account;
  throw new TradeInputError('Account must be real or paper.');
}

export const bodyObject = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TradeInputError('Send your data as a JSON object.');
  return raw as Record<string, unknown>;
};
