import { tradingDaysBetween } from './dhaka.ts';

// Rules on public price history: where today stands and what happened before — never a forecast.

export const MOVE_WINDOW_DAYS = 5;
export const MOVE_STEPS_PCT = [1, 2, 3, 5] as const;
export const DEFAULT_DIP_PCT = 2;
export const SMA_SHORT = 20;
export const SMA_LONG = 50;
export const LOW_POSITION = 0.25;
export const HIGH_POSITION = 0.75;
export const SPLIT_IF_DIP_ODDS = 40;
export const DIVIDEND_SOON_TRADING_DAYS = 10;
export const MAX_WEIGHT_PCT = 25;
export const THIN_TRADING_BDT = 5_000_000;
export const ORDER_SHARE_OF_DAY_WARN = 0.05;
// Assumed broker commission incl. the DSE/CDBL levies; brokers charge about 0.3–0.5% of the trade value.
export const BROKER_COMMISSION_PCT = 0.4;
const TICK = 0.1;

export interface PricePoint { date: string; price: number }

export type PlanAction = 'avoid' | 'buy-before-dividend' | 'buy-now' | 'split' | 'wait';
export type Trend = 'rising' | 'falling' | 'sideways' | null;

export const PLAN_TEXT: Record<PlanAction, { label: string; tone: 'bad' | 'warn' | 'info' | 'good' | 'neutral' }> = {
  avoid: { label: 'Rules flag risks', tone: 'bad' },
  'buy-before-dividend': { label: 'Dividend deadline is close', tone: 'info' },
  'buy-now': { label: 'All 8 checks pass; price not high vs its history', tone: 'good' },
  split: { label: 'Rules met; mid-range or falling price — some now, rest at alert level', tone: 'info' },
  wait: { label: 'Priced high against its own history', tone: 'warn' },
};

export interface Holding { shares: number; avgCost: number; portfolioValue: number }

export interface PlannerInput {
  code: string;
  quantity: number;
  price: number;
  series: readonly PricePoint[];
  weekLow52: number | null;
  weekHigh52: number | null;
  signal: 'avoid' | 'caution' | 'neutral' | 'research' | null;
  fraud: 'clean' | 'suspicious' | 'high' | null;
  zone: 'low' | 'middle' | 'high' | null;
  faceValue: number | null;
  dividend: { lastBuyDate: string | null; cashPct: number | null } | null;
  agmDate: string | null;
  avgDailyValue: number | null;
  holding: Holding | null;
  today: string;
  // No trade in the last 52 weeks: an order may never fill.
  illiquid?: boolean;
}

export interface MoveOdds { pct: number; within: number; fell: number | null; rose: number | null }

export interface BuyPlan {
  code: string;
  quantity: number;
  price: number;
  cost: number;
  position52: number | null;
  sma20: number | null;
  sma50: number | null;
  vsSma20Pct: number | null;
  trend: Trend;
  typicalDailyMovePct: number | null;
  // The planned shares at today's price as days of normal trading.
  sellEase: SellEase | null;
  moveOdds: MoveOdds[];
  daysCheaperPct: number | null;
  dividend: { lastBuyDate: string; tradingDaysLeft: number; cashPerShare: number | null } | null;
  // avgPrice: average over every planned lot (buy-now at price, the rest at alertPrice); commission at BROKER_COMMISSION_PCT.
  avgPrice: number;
  commission: number;
  commissionPct: number;
  totalWithCommission: number;
  afterBuy: { shares: number; avgCost: number; weightPct: number | null } | null;
  warnings: string[];
  action: PlanAction;
  label: string;
  tone: string;
  buyNow: number;
  later: number;
  alertPrice: number | null;
  reasons: string[];
  sample: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const fmt = (x: number) => x.toFixed(2);
export const toTick = (x: number) => Math.round(Math.round(x / TICK) * TICK * 100) / 100;

export function position52(price: number, low: number | null, high: number | null): number | null {
  if (low == null || high == null || !(high > low)) return null;
  return Math.min(1, Math.max(0, (price - low) / (high - low)));
}

export function sma(prices: readonly number[], days: number, endOffset = 0): number | null {
  const end = prices.length - endOffset;
  if (end < days) return null;
  return prices.slice(end - days, end).reduce((a, b) => a + b, 0) / days;
}

// How many days of normal trading (avgDailyValue, ৳ a day) a holding worth `value` taka equals; thin under THIN_TRADING_BDT a day.
export interface SellEase { days: number; thin: boolean }
export function sellEase(value: number, avgDailyValue: number | null | undefined): SellEase | null {
  if (avgDailyValue == null || !(value > 0)) return null;
  // No trades in the last 20 days: no number of days covers it.
  return avgDailyValue > 0 ? { days: value / avgDailyValue, thin: avgDailyValue < THIN_TRADING_BDT } : { days: Infinity, thin: true };
}

export function typicalDailyMove(prices: readonly number[]): number | null {
  const moves: number[] = [];
  for (let i = 1; i < prices.length; i++) if (prices[i - 1] > 0) moves.push(Math.abs(prices[i] / prices[i - 1] - 1) * 100);
  return moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null;
}

// How often a day's close was followed, within `window` trading days, by a close at least `pct`% lower / higher.
export function moveFrequency(prices: readonly number[], pct: number, window = MOVE_WINDOW_DAYS): MoveOdds {
  let fell = 0;
  let rose = 0;
  let days = 0;
  for (let i = 0; i + window < prices.length; i++) {
    if (!(prices[i] > 0)) continue;
    days++;
    const next = prices.slice(i + 1, i + 1 + window);
    if (next.some((p) => p <= prices[i] * (1 - pct / 100))) fell++;
    if (next.some((p) => p >= prices[i] * (1 + pct / 100))) rose++;
  }
  const share = (n: number) => (days ? Math.round((n / days) * 100) : null);
  return { pct, within: window, fell: share(fell), rose: share(rose) };
}

export function daysCheaper(prices: readonly number[], price: number): number | null {
  const valid = prices.filter((p) => p > 0);
  return valid.length ? Math.round((valid.filter((p) => p < price).length / valid.length) * 100) : null;
}

// Falling: below both averages and the short average still sliding over the last week; rising is the mirror.
export function trendOf(prices: readonly number[], price: number): Trend {
  const s20 = sma(prices, SMA_SHORT);
  const s50 = sma(prices, SMA_LONG);
  const s20WeekAgo = sma(prices, SMA_SHORT, MOVE_WINDOW_DAYS);
  if (s20 == null || s50 == null || s20WeekAgo == null) return null;
  if (price < s20 && price < s50 && s20 < s20WeekAgo) return 'falling';
  if (price > s20 && price > s50 && s20 > s20WeekAgo) return 'rising';
  return 'sideways';
}

// avgPrice: what the new shares cost on average; marketPrice values the position. No holding known → no weight.
export function afterBuying(holding: Holding | null, quantity: number, avgPrice: number, marketPrice = avgPrice): BuyPlan['afterBuy'] {
  const before = holding ?? { shares: 0, avgCost: 0, portfolioValue: 0 };
  const shares = before.shares + quantity;
  if (shares <= 0) return null;
  const avgCost = (before.shares * before.avgCost + quantity * avgPrice) / shares;
  const total = before.portfolioValue + quantity * marketPrice;
  return { shares, avgCost: round2(avgCost), weightPct: holding && total > 0 ? round2((shares * marketPrice / total) * 100) : null };
}

export function planBuy(p: PlannerInput): BuyPlan {
  const prices = p.series.map((x) => x.price).filter((x) => Number.isFinite(x) && x > 0);
  const pos = position52(p.price, p.weekLow52, p.weekHigh52);
  const s20 = sma(prices, SMA_SHORT);
  const s50 = sma(prices, SMA_LONG);
  const vsSma = s20 ? ((p.price - s20) / s20) * 100 : null;
  const trend = trendOf(prices, p.price);
  const moveOdds = MOVE_STEPS_PCT.map((pct) => moveFrequency(prices, pct));
  const main = moveOdds.find((d) => d.pct === DEFAULT_DIP_PCT)!;
  const typical = typicalDailyMove(prices);
  const lastBuy = p.dividend?.lastBuyDate && p.dividend.lastBuyDate >= p.today ? p.dividend.lastBuyDate : null;
  const left = lastBuy ? tradingDaysBetween(p.today, lastBuy) : 0;
  const cashPerShare = p.dividend?.cashPct != null && p.faceValue ? round2((p.dividend.cashPct / 100) * p.faceValue) : null;
  const dividend = lastBuy && left > 0 ? { lastBuyDate: lastBuy, tradingDaysLeft: left, cashPerShare } : null;
  const cost = round2(p.price * p.quantity);

  const warnings: string[] = [];
  if (p.illiquid) warnings.push('No trades in the last 52 weeks — an order may never fill, and you may not be able to sell');
  if (p.avgDailyValue != null && p.avgDailyValue < THIN_TRADING_BDT) warnings.push('Thinly traded — prices can jump between trades');
  if (p.avgDailyValue != null && p.avgDailyValue > 0 && cost / p.avgDailyValue > ORDER_SHARE_OF_DAY_WARN) {
    warnings.push(`Your order is ${((cost / p.avgDailyValue) * 100).toFixed(0)}% of a normal day's trading — it may move the price; use a limit order`);
  }
  if (p.agmDate && p.agmDate >= p.today && tradingDaysBetween(p.today, p.agmDate) <= DIVIDEND_SOON_TRADING_DAYS) warnings.push(`AGM on ${p.agmDate} — the price can move around it`);

  const facts: string[] = [];
  if (pos != null) facts.push(`৳${fmt(p.price)} is ${Math.round(pos * 100)}% of the way from the 1-year low ৳${fmt(p.weekLow52!)} to the high ৳${fmt(p.weekHigh52!)}`);
  if (vsSma != null) facts.push(`${Math.abs(vsSma).toFixed(1)}% ${vsSma < 0 ? 'below' : 'above'} its ${SMA_SHORT}-day average ৳${fmt(s20!)}`);
  if (trend) facts.push(`Trend: ${trend}`);
  if (main.fell != null) facts.push(`Within ${MOVE_WINDOW_DAYS} trading days it fell ${DEFAULT_DIP_PCT}% in ${main.fell}% and rose ${DEFAULT_DIP_PCT}% in ${main.rose}% of the last year's days`);

  const plan = (action: PlanAction, buyNow: number, alertPrice: number | null, why: string[]): BuyPlan => {
    const later = p.quantity - buyNow;
    const value = buyNow * p.price + later * (alertPrice ?? p.price);
    const avgPrice = round2(value / p.quantity);
    const commission = round2((value * BROKER_COMMISSION_PCT) / 100);
    const afterBuy = afterBuying(p.holding, p.quantity, avgPrice, p.price);
    const concentrated = afterBuy?.weightPct != null && afterBuy.weightPct > MAX_WEIGHT_PCT && (p.holding?.portfolioValue ?? 0) > 0
      ? [`After this buy ${p.code} would be ${afterBuy.weightPct.toFixed(0)}% of your holdings — more than ${MAX_WEIGHT_PCT}% in one share is concentrated`] : [];
    return {
      code: p.code, quantity: p.quantity, price: p.price, cost, position52: pos, sma20: s20 == null ? null : round2(s20), sma50: s50 == null ? null : round2(s50),
      vsSma20Pct: vsSma == null ? null : round2(vsSma), trend, typicalDailyMovePct: typical == null ? null : round2(typical), moveOdds,
      sellEase: sellEase(cost, p.avgDailyValue),
      daysCheaperPct: daysCheaper(prices, p.price), dividend, avgPrice, commission, commissionPct: BROKER_COMMISSION_PCT, totalWithCommission: round2(value + commission),
      afterBuy, warnings: [...concentrated, ...warnings], action, ...PLAN_TEXT[action], buyNow, later, alertPrice,
      reasons: [...why, ...facts], sample: Math.max(0, prices.length - MOVE_WINDOW_DAYS),
    };
  };
  const dipAlert = toTick(p.price * (1 - DEFAULT_DIP_PCT / 100));
  const half = Math.ceil(p.quantity / 2);

  if (p.illiquid) return plan('avoid', 0, null, ['No trades in the last 52 weeks — there may be no seller at any price']);
  if (p.fraud === 'high' || p.signal === 'avoid') {
    return plan('avoid', 0, null, [p.fraud === 'high' ? 'This company shows several warning-sign patterns' : 'The signal is High risk — loss-making, category Z or a high-risk pattern']);
  }
  if (dividend && dividend.tradingDaysLeft <= DIVIDEND_SOON_TRADING_DAYS && p.fraud === 'clean') {
    const cash = cashPerShare != null ? `৳${fmt(cashPerShare)} a share (৳${fmt(cashPerShare * p.quantity)} for ${p.quantity})` : 'the dividend';
    return plan('buy-before-dividend', p.quantity, null, [
      `Last day to buy for ${cash}: ${dividend.lastBuyDate} (check the record date with your broker) — ${dividend.tradingDaysLeft} trading ${dividend.tradingDaysLeft === 1 ? 'day' : 'days'} left`,
      'The price can fall after the record date, so the dividend is not free money',
    ]);
  }
  if ((pos != null && pos >= HIGH_POSITION) || p.zone === 'high') {
    const target = s20 != null && s20 < p.price ? toTick(s20) : dipAlert;
    return plan('wait', 0, target, ['Priced high against its own past — near the top of its range', `Alert at ৳${fmt(target)}, nearer its usual level`]);
  }
  if (trend === 'falling') {
    return p.quantity >= 2
      ? plan('split', half, dipAlert, [`Still in a falling trend — ${half} shares now; alert at ৳${fmt(dipAlert)} for the other ${p.quantity - half}`])
      : plan('wait', 0, dipAlert, [`Still in a falling trend — no entry signal yet; alert at ৳${fmt(dipAlert)}`]);
  }
  if (p.quantity >= 2 && (main.fell ?? 0) >= SPLIT_IF_DIP_ODDS && (main.fell ?? 0) > (main.rose ?? 0)) {
    return plan('split', half, dipAlert, [`A ${DEFAULT_DIP_PCT}% dip within a week was more common than a ${DEFAULT_DIP_PCT}% rise — ${half} shares now, alert at ৳${fmt(dipAlert)} for the rest`]);
  }
  if ((pos != null && pos <= LOW_POSITION) || (vsSma != null && vsSma <= -1)) {
    return plan('buy-now', p.quantity, null, ['Already near the low end of its range — waiting for a deeper dip rarely paid off']);
  }
  if (p.quantity >= 2) return plan('split', half, dipAlert, [`Mid-range price — ${half} shares now, alert at ৳${fmt(dipAlert)} for the other ${p.quantity - half}`]);
  return plan('buy-now', p.quantity, null, ['Mid-range price; one share is too few to split']);
}

export interface PickInput { code: string; name: string; price: number | null; signal: string; fraud: string; score: number; series: readonly PricePoint[]; weekLow52: number | null; weekHigh52: number | null }
export interface Pick { code: string; name: string; price: number; score: number; position52: number | null; vsSma20Pct: number | null; trend: Trend; shares: number | null; cost: number | null }

// Worth researching, no fraud flag, low in its range or under its 20-day average, not sliding — affordable within the budget.
export function todaysPicks(rows: readonly PickInput[], budget: number | null, limit = 10): Pick[] {
  return rows
    .filter((r) => r.signal === 'research' && r.fraud === 'clean' && r.price != null && r.price > 0)
    .map((r) => {
      const price = r.price as number;
      const prices = r.series.map((x) => x.price).filter((x) => x > 0);
      const avg = sma(prices, SMA_SHORT);
      const shares = budget != null && budget > 0 ? Math.floor(budget / price) : null;
      return {
        code: r.code, name: r.name, price, score: r.score, position52: position52(price, r.weekLow52, r.weekHigh52),
        vsSma20Pct: avg ? round2(((price - avg) / avg) * 100) : null, trend: trendOf(prices, price), shares, cost: shares == null ? null : round2(shares * price),
      };
    })
    .filter((p) => ((p.position52 ?? 1) <= 0.5 || (p.vsSma20Pct ?? 0) <= -1) && p.trend !== 'falling' && (p.shares == null || p.shares >= 1))
    .sort((a, b) => (a.position52 ?? 1) - (b.position52 ?? 1) || b.score - a.score)
    .slice(0, limit);
}
