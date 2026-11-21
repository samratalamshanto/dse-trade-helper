import type { BuyPlan, Pick } from '../../web/lib/buy-planner.ts';
import type { LiveStatus, PlanInput, PlanStatus, SavedPlan } from '../../web/lib/plans.ts';
import { parseAmount } from '../../web/lib/trades.ts';
import { getJson, type RequestOptions } from './api.ts';
import type { CheckTone } from './checks.ts';
import { fmtNum } from './format.ts';
import type { IconName } from './ui.tsx';
import { friendlyTradesError } from './trades.ts';

export type { BuyPlan, Pick, PlanInput };

export interface PlanRow extends SavedPlan { price: number | null; live: PlanStatus }
export interface PlansResponse { plans: PlanRow[]; badRows: number[] }
export interface PicksResponse { budget: number | null; picks: Pick[]; today: string }

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const TRADES_KEY = process.env.EXPO_PUBLIC_TRADES_KEY;
// With the key the server also uses the owner's holding (after-buy line, concentration warning).
export const HAS_TRADES_KEY = !!TRADES_KEY;

// Same limits as web/lib/planner-service.ts quantityFrom/picksFor.
const MAX_QTY = 10_000_000;
const MAX_BUDGET = 1_000_000_000;

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await getJson<T>(API_URL, path, fetch, { ...options, headers: { ...options.headers, 'x-trades-key': TRADES_KEY ?? '' } });
  } catch (e) {
    throw friendlyTradesError(e);
  }
}

const sendJson = <T>(method: string, path: string, body: unknown) => call<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const fetchBuyPlan = (code: string, query: string) =>
  getJson<BuyPlan>(API_URL, `/api/plan/${encodeURIComponent(code)}?${query}`, fetch, TRADES_KEY ? { headers: { 'x-trades-key': TRADES_KEY } } : {});

export const loadPlans = (path: string) => call<PlansResponse>(path);

export const savePlan = (id: string | null, input: PlanInput) =>
  id ? sendJson<SavedPlan>('PUT', `/api/plans/${encodeURIComponent(id)}`, input) : sendJson<SavedPlan>('POST', '/api/plans', input);

export const deletePlan = (id: string) => call<{ deleted: true }>(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const picksPath = (budget: number | null) => (budget == null ? '/api/picks' : `/api/picks?budget=${budget}`);

export function parseBudget(raw: string): number | null {
  const n = parseAmount(raw);
  return n != null && n > 0 && n <= MAX_BUDGET ? n : null;
}

export type PlanMode = 'qty' | 'budget';

export function planQuery(mode: PlanMode, raw: string): { ok: true; query: string } | { ok: false; error: string } {
  if (mode === 'budget') {
    const budget = parseBudget(raw);
    return budget == null ? { ok: false, error: 'Budget must be a positive amount in taka.' } : { ok: true, query: `budget=${budget}` };
  }
  const qty = parseAmount(raw);
  return qty == null || !Number.isSafeInteger(qty) || qty < 1 || qty > MAX_QTY
    ? { ok: false, error: 'Quantity must be a whole number of shares, 1 or more.' }
    : { ok: true, query: `qty=${qty}` };
}

const taka = (x: number) => `৳${fmtNum(x)}`;

export function splitLine(p: BuyPlan): string {
  const alert = p.alertPrice != null ? ` — set an alert at ${taka(p.alertPrice)}` : '';
  if (p.buyNow <= 0) return `Buy none of the ${p.quantity} now${alert}.`;
  const now = `Buy ${p.buyNow} now at about ${taka(p.price)} (${taka(p.buyNow * p.price)})`;
  if (p.later <= 0) return `${now}.`;
  return `${now}, and the other ${p.later}${p.alertPrice != null ? ` if it reaches ${taka(p.alertPrice)}` : ' later'}.`;
}

// One sentence about the past, never a forecast.
export function oddsSentence(p: BuyPlan, pct = 2): string | null {
  const m = p.moveOdds.find((x) => x.pct === pct);
  if (!m || m.fell == null || m.rose == null) return null;
  return `In the last year, within ${m.within} trading days it fell ${pct}% or more on ${m.fell}% of days and rose ${pct}% or more on ${m.rose}% of days.`;
}

export function dividendLine(p: BuyPlan): string | null {
  const d = p.dividend;
  if (!d) return null;
  const cash = d.cashPerShare != null ? ` to get ${taka(d.cashPerShare)} a share` : ' to get the dividend';
  return `Own it at the end of ${d.lastBuyDate}${cash} — ${d.tradingDaysLeft} trading ${d.tradingDaysLeft === 1 ? 'day' : 'days'} left.`;
}

export function afterBuyLine(p: BuyPlan): string | null {
  const a = p.afterBuy;
  if (!a) return null;
  const fills = p.later > 0 && p.alertPrice != null ? ', if the alert price fills' : '';
  return `After this buy${fills}: ${a.shares} shares at an average of ${taka(a.avgCost)}${a.weightPct != null ? `, ${a.weightPct.toFixed(0)}% of your holdings` : ''}.`;
}

export const TREND_TONE: Record<NonNullable<BuyPlan['trend']>, CheckTone> = { rising: 'good', falling: 'bad', sideways: 'neutral' };

export const STATUS_LOOK: Record<LiveStatus, { label: string; tone: CheckTone; icon: IconName }> = {
  reached: { label: 'Target reached', tone: 'good', icon: 'notifications' },
  waiting: { label: 'Waiting', tone: 'info', icon: 'time-outline' },
  expired: { label: 'Ended', tone: 'warn', icon: 'alert-circle-outline' },
  done: { label: 'Done', tone: 'neutral', icon: 'checkmark-done-outline' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' },
};

export const isOpenPlan = (p: PlanRow) => p.status === 'active';

// Form strings for plan-edit from a checked buy plan: the rest is bought at the alert price.
export function formFromBuyPlan(p: BuyPlan): Record<string, string> {
  return {
    code: p.code, quantity: String(p.quantity), boughtNow: String(p.buyNow),
    targetPrice: p.alertPrice != null ? String(p.alertPrice) : '', note: p.label,
  };
}

export function formFromRow(p: PlanRow): Record<string, string> {
  return {
    id: p.id, code: p.code, quantity: String(p.quantity), boughtNow: String(p.boughtNow),
    targetPrice: p.targetPrice != null ? String(p.targetPrice) : '', until: p.until ?? '', note: p.note, status: p.status,
  };
}

export const inputFromRow = (p: PlanRow, status: PlanInput['status']): PlanInput =>
  ({ code: p.code, quantity: p.quantity, boughtNow: p.boughtNow, targetPrice: p.targetPrice, until: p.until, note: p.note, status });
