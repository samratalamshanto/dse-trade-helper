// 52-week range figures and the user's own range rules. Pure functions, shared by the /range page, Sheet sync and alerts.

export interface RangeRow { code: string; price: number | null; weekLow52: number | null; weekHigh52: number | null }
export interface RangeStats { aboveLowPct: number; belowHighPct: number; position: number }
export interface Owned { code: string; shares: number; avgCost: number }

export type RangeRuleKind = 'nearLow' | 'nearHigh' | 'upFromBuy' | 'downFromBuy';
export type RangeScope = 'all' | 'watchlist' | 'holdings';
export interface RangeRule { id: string; kind: RangeRuleKind; pct: number; scope: RangeScope }
export interface RangeMatch { rule: RangeRule; code: string; valuePct: number }

export const RANGE_RULES_STORE = 'rangeRules';
export const RANGE_RULES_MAX = 20;
export const RANGE_PCT_MIN = 0.5;
export const RANGE_PCT_MAX = 100;
const KINDS: readonly RangeRuleKind[] = ['nearLow', 'nearHigh', 'upFromBuy', 'downFromBuy'];
const SCOPES: readonly RangeScope[] = ['all', 'watchlist', 'holdings'];
// Rules about "my buy" need a buy price, so they only ever look at holdings.
const NEEDS_HOLDING: ReadonlySet<RangeRuleKind> = new Set(['upFromBuy', 'downFromBuy']);

const round1 = (x: number) => Math.round(x * 10) / 10;
const ok = (x: number | null): x is number => x != null && Number.isFinite(x) && x > 0;

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

export const gainFromBuyPct = (price: number | null, avgCost: number): number | null =>
  ok(price) && avgCost > 0 ? round1((price / avgCost - 1) * 100) : null;

// The figure a rule compares with its threshold, or null when the rule cannot apply to this company.
function ruleValue(rule: RangeRule, row: RangeRow, owned: Owned | undefined): number | null {
  if (rule.kind === 'nearLow' || rule.kind === 'nearHigh') {
    const s = rangeStats(row);
    if (!s) return null;
    return rule.kind === 'nearLow' ? s.aboveLowPct : s.belowHighPct;
  }
  if (!owned || owned.shares <= 0) return null;
  const gain = gainFromBuyPct(row.price, owned.avgCost);
  if (gain == null) return null;
  return rule.kind === 'upFromBuy' ? gain : -gain;
}

function matches(rule: RangeRule, value: number): boolean {
  // near: within pct of the low or high (a price below a stale low counts as near). from buy: moved at least pct.
  return rule.kind === 'nearLow' || rule.kind === 'nearHigh' ? value <= rule.pct : value >= rule.pct;
}

export interface FeedInput { rows: readonly RangeRow[]; watchlist: readonly string[]; holdings: readonly Owned[] }

// Every company that matches at least one rule, in rule order, each rule's matches sorted closest-first.
export function rangeFeed(rules: readonly RangeRule[], input: FeedInput): RangeMatch[] {
  const owned = new Map(input.holdings.filter((h) => h.shares > 0).map((h) => [h.code, h]));
  const watched = new Set(input.watchlist);
  const out: RangeMatch[] = [];
  for (const rule of rules) {
    const scope = NEEDS_HOLDING.has(rule.kind) ? 'holdings' : rule.scope;
    const found: RangeMatch[] = [];
    for (const row of input.rows) {
      if (scope === 'holdings' && !owned.has(row.code)) continue;
      if (scope === 'watchlist' && !watched.has(row.code)) continue;
      const value = ruleValue(rule, row, owned.get(row.code));
      if (value != null && matches(rule, value)) found.push({ rule, code: row.code, valuePct: value });
    }
    const near = rule.kind === 'nearLow' || rule.kind === 'nearHigh';
    found.sort((a, b) => (near ? a.valuePct - b.valuePct : b.valuePct - a.valuePct) || a.code.localeCompare(b.code));
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
    if (typeof id !== 'string' || !/^[\w-]{1,40}$/.test(id) || seen.has(id)) continue;
    if (!KINDS.includes(kind as RangeRuleKind) || !SCOPES.includes(scope as RangeScope)) continue;
    const n = typeof pct === 'number' ? pct : Number(pct);
    if (!Number.isFinite(n) || n < RANGE_PCT_MIN || n > RANGE_PCT_MAX) continue;
    seen.add(id);
    out.push({ id, kind: kind as RangeRuleKind, pct: round1(n), scope: NEEDS_HOLDING.has(kind as RangeRuleKind) ? 'holdings' : scope as RangeScope });
    if (out.length === RANGE_RULES_MAX) break;
  }
  return out;
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
