import { planBuy, todaysPicks, type Holding } from './buy-planner.ts';
import { dhakaToday } from './dhaka.ts';
import { livePrices } from './dse.ts';
import { boughtSince, planCreatedAt, planStatus, planToRow, plansFromRows, PLAN_COLUMNS, type SavedPlan, validatePlan } from './plans.ts';
import { companyDetail, listCompanies } from './service.ts';
import { appendRows, deleteRow, readRows, serialPerSheet, SheetsError, writeRow, type TabSpec } from './sheets.ts';
import { allCompanies } from './store.ts';
import { holdingsFrom, fromRows, MAX_PRICE, type Trade } from './trades.ts';
import { givenId, TradeInputError } from './trades-service.ts';
import { randomUUID } from 'node:crypto';

const PLANS: TabSpec = { title: 'plans', columns: PLAN_COLUMNS };
export const MAX_BUDGET = 1_000_000_000;

export function quantityFrom(params: URLSearchParams, price: number | null): number {
  const qty = Number(params.get('qty'));
  if (params.has('qty')) {
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10_000_000) throw new TradeInputError('Quantity must be a whole number of shares, 1 or more.');
    return qty;
  }
  const budget = Number(params.get('budget'));
  if (!params.has('budget') || !Number.isFinite(budget) || budget <= 0 || budget > MAX_BUDGET) throw new TradeInputError('Give a quantity (qty) or a budget in taka.');
  if (!price) throw new TradeInputError('No live price, so a budget cannot be turned into shares.');
  const shares = Math.floor(budget / price);
  if (shares < 1) throw new TradeInputError(`৳${budget} is less than one share at ৳${price.toFixed(2)}.`);
  return shares;
}

async function holdingFor(code: string): Promise<Holding | null> {
  const { trades } = fromRows(await readRows());
  const { holdings } = holdingsFrom(trades);
  const live = await livePrices().catch((e: unknown) => { console.warn('planner: live prices unavailable', e); return {} as Record<string, { ltp: number }>; });
  const portfolioValue = holdings.reduce((a, h) => a + h.shares * (live[h.code]?.ltp || h.avgCost), 0);
  const h = holdings.find((x) => x.code === code && x.shares > 0);
  return h ? { shares: h.shares, avgCost: h.avgCost, portfolioValue } : { shares: 0, avgCost: 0, portfolioValue };
}

const MAX_SHARES_HELD = 1_000_000_000;

// Browser mode has no holdings on the server, so the page sends this company's holding: ?shares=&avgCost=&portfolioValue=
export function holdingFromParams(params: URLSearchParams): Holding | null {
  if (!params.has('shares')) return null;
  const shares = Number(params.get('shares'));
  const avgCost = Number(params.get('avgCost'));
  const portfolioValue = Number(params.get('portfolioValue'));
  if (!Number.isSafeInteger(shares) || shares < 0 || shares > MAX_SHARES_HELD) throw new TradeInputError('Shares held must be a whole number, 0 or more.');
  if (!Number.isFinite(avgCost) || avgCost < 0 || avgCost > MAX_PRICE) throw new TradeInputError('Average cost must be an amount in taka.');
  if (!Number.isFinite(portfolioValue) || portfolioValue < 0 || portfolioValue > MAX_SHARES_HELD * MAX_PRICE) throw new TradeInputError('Portfolio value must be an amount in taka.');
  return { shares, avgCost, portfolioValue };
}

export async function buyPlanFor(code: string, params: URLSearchParams, withHolding: boolean) {
  const given = withHolding ? null : holdingFromParams(params);
  const d = await companyDetail(code, false);
  const price = d.company.price;
  const quantity = quantityFrom(params, price);
  if (!price) throw new TradeInputError('No live price for this company right now.');
  const holding = withHolding ? await holdingFor(code).catch((e: unknown) => { console.warn('planner: holding unavailable', e); return null; }) : given;
  const up = d.dividend.upcoming;
  return planBuy({
    code, quantity, price, series: d.company.series ?? [], weekLow52: d.company.weekLow52 ?? null, weekHigh52: d.company.weekHigh52 ?? null,
    signal: d.analysis.signal, fraud: d.analysis.fraud.level, zone: d.position.zone, faceValue: d.company.faceValue ?? null,
    dividend: up ? { lastBuyDate: up.lastBuyDate ?? null, cashPct: up.cashPct ?? null } : null, agmDate: up?.agmDate ?? null,
    avgDailyValue: d.analysis.metrics.avgDailyValue, holding, today: dhakaToday(), illiquid: d.analysis.metrics.illiquid,
  });
}

export async function picksFor(params: URLSearchParams) {
  const raw = params.get('budget');
  const budget = raw == null || raw === '' ? null : Number(raw);
  if (budget != null && (!Number.isFinite(budget) || budget <= 0 || budget > MAX_BUDGET)) throw new TradeInputError('Budget must be a positive amount in taka.');
  const { rows } = await listCompanies();
  const store = allCompanies();
  const picks = todaysPicks(rows.map((r) => {
    const c = store[r.code];
    return { code: r.code, name: r.name, price: r.price, signal: r.signal, fraud: r.fraud, score: r.score, series: c?.series ?? [], weekLow52: c?.weekLow52 ?? null, weekHigh52: c?.weekHigh52 ?? null };
  }), budget);
  return { budget, picks, today: dhakaToday() };
}

const serial = serialPerSheet();

const checked = (input: unknown) => { const v = validatePlan(input); if (!v.ok) throw new TradeInputError(v.error); return v.value; };

export async function listPlans() {
  const { plans: saved, badRows } = plansFromRows(await readRows(PLANS));
  return plansWithStatus(saved, fromRows(await readRows()).trades, badRows);
}

// Shared by the Sheet and by browser mode (lib/browser-data.ts). Pass real-account trades only.
export async function plansWithStatus(saved: readonly SavedPlan[], trades: readonly Trade[], badRows: number[] = []) {
  // "Bought" comes from the real trades, so the plan, Portfolio and the dashboard always agree.
  const plans = saved.map((p) => ({ ...p, boughtNow: boughtSince(p, trades) }));
  const live = await livePrices().catch((e: unknown) => { console.warn('plans: live prices unavailable', e); return {} as Record<string, { ltp: number }>; });
  const today = dhakaToday();
  return {
    plans: plans.map((p) => ({ id: p.id, code: p.code, quantity: p.quantity, boughtNow: p.boughtNow, targetPrice: p.targetPrice, until: p.until, note: p.note, status: p.status, createdAt: p.createdAt, price: live[p.code]?.ltp || null, live: planStatus(p, live[p.code]?.ltp || null, today) }))
      .sort((a, b) => Number(a.live.status !== 'reached') - Number(b.live.status !== 'reached') || b.createdAt.localeCompare(a.createdAt)),
    badRows,
  };
}

export const addPlan = (input: unknown) => serial(async () => {
  const value = checked(input);
  const id = givenId(input);
  const existing = id ? plansFromRows(await readRows(PLANS)).plans.find((p) => p.id === id) : undefined;
  if (existing) return existing;
  const plan: SavedPlan = { ...value, id: id ?? randomUUID(), createdAt: planCreatedAt((input as { createdAt?: unknown }).createdAt) };
  await appendRows([planToRow(plan)], PLANS);
  return plan;
});

async function planRow(id: string) {
  const found = plansFromRows(await readRows(PLANS)).plans.find((p) => p.id === id);
  if (!found) throw new SheetsError('That plan no longer exists. Reload the list.', 404);
  return found;
}

export const updatePlan = (id: string, input: unknown) => serial(async () => {
  const old = await planRow(id);
  const plan: SavedPlan = { ...checked(input), id, createdAt: old.createdAt };
  await writeRow(old.row, planToRow(plan), PLANS);
  return plan;
});

export const deletePlan = (id: string) => serial(async () => { await deleteRow((await planRow(id)).row, id, PLANS); });
