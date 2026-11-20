// Pure alert rule logic, free of React so it can be unit-tested.

import { CODE_RE, dhakaToday } from './dhaka.ts';
const FIRED_MAX = 500;
const HISTORY_MAX = 100;

export type AlertRule =
  | { type: 'price_above'; id: string; enabled: boolean; code: string; target: number }
  | { type: 'price_below'; id: string; enabled: boolean; code: string; target: number }
  | { type: 'dividend'; id: string; enabled: boolean; code: string; daysBefore: number }
  | { type: 'fraud_flag'; id: string; enabled: boolean; code: string; seenFlags: string[] }
  | { type: 'big_move'; id: string; enabled: boolean; code: string; threshold: number };

export type RuleType = AlertRule['type'];

export interface TriggeredEvent {
  ruleId: string;
  code: string;
  message: string;
  key: string;
  date: string;
}

export interface EvalResult {
  events: TriggeredEvent[];
  seenFlagsUpdates: { ruleId: string; seenFlags: string[] }[];
}

type FiredLog = Record<string, string>;

export interface AlertStore {
  rules: AlertRule[];
  fired: FiredLog;
  history: TriggeredEvent[];
}

function parseRule(raw: unknown): AlertRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id ? r.id : null;
  const enabled = r.enabled !== false;
  const rawCode = typeof r.code === 'string' ? r.code.trim().toUpperCase() : '';
  if (!id || !CODE_RE.test(rawCode)) return null;
  const code = rawCode;

  switch (r.type) {
    case 'price_above':
    case 'price_below': {
      const t = r.target;
      if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null;
      return { type: r.type, id, enabled, code, target: t };
    }
    case 'dividend': {
      const db = r.daysBefore;
      const daysBefore = typeof db === 'number' && Number.isInteger(db) && db >= 0 && db <= 30 ? db : 3;
      return { type: 'dividend', id, enabled, code, daysBefore };
    }
    case 'fraud_flag': {
      const sf = r.seenFlags;
      const seenFlags = Array.isArray(sf) ? sf.filter((f): f is string => typeof f === 'string') : [];
      return { type: 'fraud_flag', id, enabled, code, seenFlags };
    }
    case 'big_move': {
      const thr = r.threshold;
      if (typeof thr !== 'number' || !Number.isFinite(thr) || thr <= 0) return null;
      return { type: 'big_move', id, enabled, code, threshold: thr };
    }
    default: return null;
  }
}

function parseFired(raw: unknown): FiredLog {
  const fired: FiredLog = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fired;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') fired[k] = v;
  }
  return fired;
}

function parseHistory(raw: unknown): TriggeredEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: TriggeredEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.ruleId === 'string' && typeof e.code === 'string' &&
        typeof e.message === 'string' && typeof e.key === 'string' && typeof e.date === 'string') {
      out.push({ ruleId: e.ruleId, code: e.code, message: e.message, key: e.key, date: e.date });
    }
  }
  return out;
}

export function parseAlertStore(raw: string | null | undefined): AlertStore {
  let parsed: unknown;
  try { parsed = JSON.parse(raw || '{}'); } catch { return { rules: [], fired: {}, history: [] }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { rules: [], fired: {}, history: [] };
  const p = parsed as Record<string, unknown>;
  return {
    rules: Array.isArray(p.rules) ? p.rules.map(parseRule).filter((r): r is AlertRule => r !== null) : [],
    fired: parseFired(p.fired),
    history: parseHistory(p.history),
  };
}

export function encodeAlertStore(store: AlertStore): string {
  return JSON.stringify(store);
}

export const dhakaDate = dhakaToday;

export interface CompanySnap { code: string; price: number | null; changePct: number | null | undefined; flags: string[] }
export interface DivSnap { code: string; lastBuyDate: string | null; lastBuyEstimated?: boolean }

const WHEN: Record<number, string> = { 0: 'today', 1: 'tomorrow' };
const PRICE_RULES: ReadonlySet<RuleType> = new Set(['price_above', 'price_below', 'big_move']);

// A price from an earlier session would re-fire price and move rules every day the market is closed.
export function rulesForSession(rules: readonly AlertRule[], sessionDate: string | null | undefined, today: string): AlertRule[] {
  return sessionDate === today ? [...rules] : rules.filter((r) => !PRICE_RULES.has(r.type));
}

export function evaluateRules(
  rules: readonly AlertRule[],
  companies: readonly CompanySnap[],
  dividends: readonly DivSnap[],
  today: string,
  fired: FiredLog,
): EvalResult {
  const byCode: Record<string, CompanySnap> = {};
  for (const c of companies) byCode[c.code] = c;
  const divByCode: Record<string, DivSnap> = {};
  for (const d of dividends) divByCode[d.code] = d;

  const events: TriggeredEvent[] = [];
  const seenFlagsUpdates: { ruleId: string; seenFlags: string[] }[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const key = `${rule.id}:${today}`;
    if (fired[key] === today) continue;

    switch (rule.type) {
      case 'price_above': {
        const co = byCode[rule.code];
        if (co?.price == null || co.price <= 0 || !Number.isFinite(co.price)) break;
        if (co.price >= rule.target) {
          events.push({ ruleId: rule.id, code: rule.code, key, date: today,
            message: `${rule.code} price ৳${co.price.toFixed(2)} reached your target of ৳${rule.target.toFixed(2)}` });
        }
        break;
      }
      case 'price_below': {
        const co = byCode[rule.code];
        if (co?.price == null || co.price <= 0 || !Number.isFinite(co.price)) break;
        if (co.price <= rule.target) {
          events.push({ ruleId: rule.id, code: rule.code, key, date: today,
            message: `${rule.code} price ৳${co.price.toFixed(2)} dropped to ৳${rule.target.toFixed(2)}` });
        }
        break;
      }
      case 'dividend': {
        const dv = divByCode[rule.code];
        if (!dv?.lastBuyDate) break;
        const ms = new Date(dv.lastBuyDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime();
        const daysLeft = Math.round(ms / 86_400_000);
        if (daysLeft >= 0 && daysLeft <= rule.daysBefore) {
          const when = WHEN[daysLeft] ?? `in ${daysLeft} days`;
          const dateLabel = dv.lastBuyEstimated ? `${dv.lastBuyDate}, estimated` : dv.lastBuyDate;
          events.push({ ruleId: rule.id, code: rule.code, key, date: today,
            message: `${rule.code}: last day to buy for dividend is ${when} (${dateLabel})` });
        }
        break;
      }
      case 'fraud_flag': {
        const co = byCode[rule.code];
        if (!co) break;
        const newFlags = co.flags.filter((f) => !rule.seenFlags.includes(f));
        if (newFlags.length > 0) {
          events.push({ ruleId: rule.id, code: rule.code, key, date: today,
            message: `${rule.code} has new fraud flag${newFlags.length > 1 ? 's' : ''}: ${newFlags.join(', ')}` });
          seenFlagsUpdates.push({ ruleId: rule.id, seenFlags: [...co.flags] });
        }
        break;
      }
      case 'big_move': {
        const co = byCode[rule.code];
        if (!co || co.changePct == null || !Number.isFinite(co.changePct)) break;
        if (Math.abs(co.changePct) >= rule.threshold) {
          const dir = co.changePct > 0 ? 'up' : 'down';
          events.push({ ruleId: rule.id, code: rule.code, key, date: today,
            message: `${rule.code} moved ${dir} ${Math.abs(co.changePct).toFixed(1)}% today (threshold: ${rule.threshold}%)` });
        }
        break;
      }
    }
  }

  return { events, seenFlagsUpdates };
}

export function applyFiredResult(store: AlertStore, result: EvalResult, today: string): AlertStore {
  if (!result.events.length && !result.seenFlagsUpdates.length) return store;

  const fired = { ...store.fired };
  for (const e of result.events) fired[e.key] = today;

  const keys = Object.keys(fired);
  if (keys.length > FIRED_MAX) {
    keys.sort((a, b) => (fired[a] < fired[b] ? -1 : fired[a] > fired[b] ? 1 : 0));
    for (const k of keys.slice(0, keys.length - FIRED_MAX)) delete fired[k];
  }

  const updateMap = new Map(result.seenFlagsUpdates.map((u) => [u.ruleId, u.seenFlags]));
  const rules = store.rules.map((rule): AlertRule => {
    if (rule.type !== 'fraud_flag') return rule;
    const sf = updateMap.get(rule.id);
    return sf ? { ...rule, seenFlags: sf } : rule;
  });

  const history = [...result.events, ...store.history].slice(0, HISTORY_MAX);
  return { rules, fired, history };
}

export function newRuleId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
