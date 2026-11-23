// 52-week range figures and the user's own range rules. Pure functions, shared by the /range page, Sheet sync and alerts.
import { QUICK_PICKS, QUICK_PICK_KEYS, pickTest, type Medians, type QuickPickKey } from './quick-picks.ts';
import type { CompanyRow } from './service.ts';

const QUICK_PICKS_LABEL: Record<QuickPickKey, string> = Object.fromEntries(QUICK_PICKS.map((p) => [p.key, p.label])) as Record<QuickPickKey, string>;

export interface RangeRow { code: string; price: number | null; weekLow52: number | null; weekHigh52: number | null }
export interface RangeStats { aboveLowPct: number; belowHighPct: number; position: number }
export interface Owned { code: string; shares: number; avgCost: number }

export type RangeRuleKind = 'nearLow' | 'nearHigh' | 'upFromBuy' | 'downFromBuy';
export type RangeScope = 'all' | 'watchlist' | 'holdings';
export interface RangeRule { id: string; kind: RangeRuleKind; pct: number; scope: RangeScope; pick?: QuickPickKey }
export interface RangeMatch { rule: RangeRule; code: string; valuePct: number }

export const RANGE_RULES_STORE = 'rangeRules';
export const RANGE_RULES_MAX = 20;
export const RANGE_PCT_MIN = 0.5;
export const RANGE_PCT_MAX = 100;
const KINDS: readonly RangeRuleKind[] = ['nearLow', 'nearHigh', 'upFromBuy', 'downFromBuy'];
const SCOPES: readonly RangeScope[] = ['all', 'watchlist', 'holdings'];
// Rules about "my buy" need a buy price, so they only ever look at holdings.
const NEEDS_HOLDING: ReadonlySet<RangeRuleKind> = new Set(['upFromBuy', 'downFromBuy']);

// For display only; matching uses the exact value. `+ 0` turns -0 into 0.
const round1 = (x: number) => Math.round(x * 10) / 10 + 0;
const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const EPS = 1e-9;

// null when the price or the range is missing or broken (low above high, price outside a stale range is still shown).
export function rangeStats(r: RangeRow): RangeStats | null {
  if (!ok(r.price) || !ok(r.weekLow52) || !ok(r.weekHigh52) || r.weekLow52 > r.weekHigh52) return null;
  const span = r.weekHigh52 - r.weekLow52;
  return {
    aboveLowPct: round1((r.price / r.weekLow52 - 1) * 100),
    belowHighPct: round1((1 - r.price / r.weekHigh52) * 100),
    // 0 = at the low, 1 = at the high; a price outside the range is clamped.
    position: span === 0 ? 0.5 : Math.min(1, Math.max(0, (r.price - r.weekLow52) / span)),
  };
}

const rawGain = (price: number | null, avgCost: number): number | null => (ok(price) && ok(avgCost) ? (price / avgCost - 1) * 100 : null);

export const gainFromBuyPct = (price: number | null, avgCost: number): number | null => {
  const g = rawGain(price, avgCost);
  return g == null ? null : round1(g);
};

// The figure a rule compares with its threshold, or null when the rule cannot apply to this company.
function ruleValue(rule: RangeRule, row: RangeRow, owned: Owned | undefined): number | null {
  if (rule.kind === 'nearLow' || rule.kind === 'nearHigh') {
    if (!rangeStats(row)) return null;
    const price = row.price as number, low = row.weekLow52 as number, high = row.weekHigh52 as number;
    return rule.kind === 'nearLow' ? (price / low - 1) * 100 : (1 - price / high) * 100;
  }
  if (!owned || !ok(owned.shares)) return null;
  const gain = rawGain(row.price, owned.avgCost);
  if (gain == null) return null;
  return rule.kind === 'upFromBuy' ? gain : -gain;
}

function matches(rule: RangeRule, value: number): boolean {
  // near: between the low (or high) and pct from it; a price outside a stale range is not "near". from buy: moved at least pct.
  // EPS absorbs float noise (30 / 25 - 1 is 0.19999999999999996), so a value equal to the threshold matches.
  return rule.kind === 'nearLow' || rule.kind === 'nearHigh' ? value >= -EPS && value <= rule.pct + EPS : value >= rule.pct - EPS;
}

export interface FeedInput { rows: readonly RangeRow[]; watchlist: readonly string[]; holdings: readonly Owned[]; companies?: readonly CompanyRow[]; medians?: Medians }

// Every company that matches at least one rule, in rule order, each rule's matches sorted closest-first.
export function rangeFeed(rules: readonly RangeRule[], input: FeedInput): RangeMatch[] {
  const owned = new Map(input.holdings.filter((h) => ok(h.shares)).map((h) => [h.code, h]));
  const watched = new Set(input.watchlist);
  const companyMap = input.companies ? new Map(input.companies.map((c) => [c.code, c])) : null;
  const checkers = new Map<QuickPickKey, (row: CompanyRow) => boolean>();
  const checker = (k: QuickPickKey) => {
    if (!checkers.has(k)) checkers.set(k, pickTest(k, input.companies ?? [], input.medians));
    return checkers.get(k)!;
  };
  const out: RangeMatch[] = [];
  for (const rule of rules) {
    const scope = NEEDS_HOLDING.has(rule.kind) ? 'holdings' : rule.scope;
    const found: RangeMatch[] = [];
    for (const row of input.rows) {
      if (scope === 'holdings' && !owned.has(row.code)) continue;
      if (scope === 'watchlist' && !watched.has(row.code)) continue;
      // A rule with a pick but no company list matches nothing: it never falls open to every company.
      if (rule.pick) {
        const company = companyMap?.get(row.code);
        if (!company || !checker(rule.pick)(company)) continue;
      }
      const value = ruleValue(rule, row, owned.get(row.code));
      if (value != null && matches(rule, value)) found.push({ rule, code: row.code, valuePct: round1(value) });
    }
    const near = rule.kind === 'nearLow' || rule.kind === 'nearHigh';
    // A plain code compare, so the page and the Telegram job list ties in the same order.
    found.sort((a, b) => (near ? a.valuePct - b.valuePct : b.valuePct - a.valuePct) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    out.push(...found);
  }
  return out;
}

// Rules come from browser storage or the user's Sheet: anything malformed is dropped, never trusted.
export function parseRangeRules(raw: unknown): RangeRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RangeRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const { id, kind, pct, scope } = r as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[\w-]{1,40}$/.test(id) || RESERVED_IDS.has(id) || seen.has(id)) continue;
    if (!KINDS.includes(kind as RangeRuleKind) || !SCOPES.includes(scope as RangeScope)) continue;
    // Only a plain number or a plain decimal string: no booleans, hex, exponents or blanks.
    const n = typeof pct === 'number' ? pct : typeof pct === 'string' && /^\d+(\.\d+)?$/.test(pct.trim()) ? Number(pct.trim()) : Number.NaN;
    if (!Number.isFinite(n) || n < RANGE_PCT_MIN || n > RANGE_PCT_MAX) continue;
    const { pick } = r as Record<string, unknown>;
    const validPick = typeof pick === 'string' && (QUICK_PICK_KEYS as readonly string[]).includes(pick) ? pick as QuickPickKey : undefined;
    seen.add(id);
    const rule: RangeRule = { id, kind: kind as RangeRuleKind, pct: round1(n), scope: NEEDS_HOLDING.has(kind as RangeRuleKind) ? 'holdings' : scope as RangeScope };
    if (validPick) rule.pick = validPick;
    out.push(rule);
    if (out.length === RANGE_RULES_MAX) break;
  }
  return out;
}

// Plain words for a rule, e.g. "within 5% of the 52-week low (your holdings)" or "within 10% of the 52-week low, Good companies (all companies)".
export function describeRule(r: RangeRule): string {
  const where = r.scope === 'holdings' ? 'your holdings' : r.scope === 'watchlist' ? 'your watchlist' : 'all companies';
  const pickLabel = r.pick ? QUICK_PICKS_LABEL[r.pick] : null;
  const suffix = pickLabel ? `, ${pickLabel} (${where})` : ` (${where})`;
  switch (r.kind) {
    case 'nearLow': return `within ${r.pct}% of the 52-week low${suffix}`;
    case 'nearHigh': return `within ${r.pct}% of the 52-week high${suffix}`;
    case 'upFromBuy': return `up ${r.pct}% or more from your buy${suffix}`;
    default: return `down ${r.pct}% or more from your buy${suffix}`;
  }
}

// Plain words for a match; the same text is used on the page and in Telegram.
export function describeMatch(m: RangeMatch): string {
  const v = Math.abs(m.valuePct);
  switch (m.rule.kind) {
    case 'nearLow': return m.valuePct < 0 ? `${v}% below its 52-week low` : `${v}% above its 52-week low`;
    case 'nearHigh': return m.valuePct < 0 ? `${v}% above its 52-week high` : `${v}% below its 52-week high`;
    case 'upFromBuy': return `up ${v}% from your average buy price`;
    default: return `down ${v}% from your average buy price`;
  }
}
