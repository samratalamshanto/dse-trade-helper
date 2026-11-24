'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { Icon } from '@/components/ui';
import { useStoredValue } from '@/components/useStored';
import {
  parseRangeRules, rangeFeed,
  RANGE_RULES_STORE, RANGE_RULES_MAX, RANGE_PCT_MIN, RANGE_PCT_MAX,
  type RangeMatch, type RangeRow, type RangeRule, type RangeRuleKind, type RangeScope, type Owned,
} from '@/lib/range';
import { QUICK_PICKS, type QuickPickKey } from '@/lib/quick-picks';
import type { CompanyRow } from '@/lib/service';

interface Props {
  rows: readonly RangeRow[];
  // Full company rows, so a rule's quick pick (e.g. Good companies) can be checked.
  companies: readonly CompanyRow[];
  medians?: Record<string, number | null>;
  watchlist: readonly string[];
  holdings: readonly Owned[];
}

const KIND_LABELS: { kind: RangeRuleKind; label: string }[] = [
  { kind: 'nearLow', label: 'Near its low' },
  { kind: 'nearHigh', label: 'Near its high' },
  { kind: 'upFromBuy', label: 'Up from my buy' },
  { kind: 'downFromBuy', label: 'Down from my buy' },
];

const SCOPE_LABELS: { scope: RangeScope; label: string }[] = [
  { scope: 'all', label: 'All companies' },
  { scope: 'watchlist', label: 'Watchlist' },
  { scope: 'holdings', label: 'My holdings' },
];

const BUY_KINDS = new Set<RangeRuleKind>(['upFromBuy', 'downFromBuy']);
// Each rule shows its closest matches first; the rest open on request, so the table below stays in reach.
const SHOWN_PER_RULE = 10;

// crypto.randomUUID needs a secure origin (https or localhost); a LAN http address falls back.
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

// The stored list as-is: entries this page cannot read (from another device or version) are kept, not erased.
function rawList(raw: string): unknown[] {
  try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function MyRules({ rows, companies, medians, watchlist, holdings }: Props) {
  const { t } = useLang();
  const [rawRules, setRawRules] = useStoredValue(RANGE_RULES_STORE, '[]');
  const rules = useMemo<RangeRule[]>(() => parseRangeRules(rawList(rawRules)), [rawRules]);

  const [kind, setKind] = useState<RangeRuleKind>('nearLow');
  const [pct, setPct] = useState('10');
  const [scope, setScope] = useState<RangeScope>('all');
  const [pick, setPick] = useState<QuickPickKey | ''>('');
  const [addError, setAddError] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const feed = useMemo(() => rangeFeed(rules, { rows, companies, medians, watchlist, holdings }), [rules, rows, companies, medians, watchlist, holdings]);
  const byRule = useMemo(() => {
    const m = new Map<string, RangeMatch[]>();
    for (const x of feed) m.set(x.rule.id, [...(m.get(x.rule.id) ?? []), x]);
    return m;
  }, [feed]);

  const kindLabel = (k: RangeRuleKind) => t(KIND_LABELS.find((x) => x.kind === k)?.label ?? k);
  const ruleTitle = (r: RangeRule) => {
    const where = BUY_KINDS.has(r.kind) ? '' : ` · ${t(SCOPE_LABELS.find((s) => s.scope === r.scope)?.label ?? r.scope)}`;
    const picked = r.pick ? ` · ${t(QUICK_PICKS.find((q) => q.key === r.pick)?.label ?? r.pick)}` : '';
    return `${kindLabel(r.kind)} ${r.pct}%${picked}${where}`;
  };
  // Same facts as describeMatch in lib/range.ts (used by Telegram), worded through the translation table.
  const matchText = (m: RangeMatch) => {
    const v = String(Math.abs(m.valuePct));
    const key = m.rule.kind === 'nearLow' ? (m.valuePct < 0 ? '{v}% below its 52-week low' : '{v}% above its 52-week low')
      : m.rule.kind === 'nearHigh' ? (m.valuePct < 0 ? '{v}% above its 52-week high' : '{v}% below its 52-week high')
        : m.rule.kind === 'upFromBuy' ? 'up {v}% from your average buy price' : 'down {v}% from your average buy price';
    return t(key).replace('{v}', v);
  };

  function deleteRule(id: string) {
    setRawRules(JSON.stringify(rawList(rawRules).filter((r) => !(r && typeof r === 'object' && (r as { id?: unknown }).id === id))));
  }

  function addRule(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(pct);
    if (!Number.isFinite(n) || n < RANGE_PCT_MIN || n > RANGE_PCT_MAX) {
      setAddError(t('Enter a number between {min} and {max}.').replace('{min}', String(RANGE_PCT_MIN)).replace('{max}', String(RANGE_PCT_MAX)));
      return;
    }
    if (rules.length >= RANGE_RULES_MAX) {
      setAddError(t('You have reached the maximum of {max} rules.').replace('{max}', String(RANGE_RULES_MAX)));
      return;
    }
    const newRule: RangeRule = { id: newId(), kind, pct: n, scope: BUY_KINDS.has(kind) ? 'holdings' : scope, ...(pick ? { pick } : {}) };
    setRawRules(JSON.stringify([...rawList(rawRules), newRule]));
    setPct('10');
    setAddError('');
  }

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const isBuy = BUY_KINDS.has(kind);

  return (
    <div className="panel">
      <h2 className="h3" id="my-rules-heading"><Tr text="Saved rules" /></h2>
      <p className="small muted"><Tr text="Matches show here. With Telegram connected, each rule sends one message per trading day." /></p>
      {rules.length === 0 ? <p className="small muted"><Tr text="No rules yet: add one below." /></p> : null}
      {rules.map((r) => {
        const matches = byRule.get(r.id) ?? [];
        const open = expanded.has(r.id);
        const shown = open ? matches : matches.slice(0, SHOWN_PER_RULE);
        return (
          <section key={r.id} className="range-rule" aria-label={ruleTitle(r)}>
            <div className="range-rule-head">
              <span><b>{ruleTitle(r)}</b> <span className="muted">— {t(matches.length === 1 ? '{n} match' : '{n} matches').replace('{n}', String(matches.length))}</span></span>
              <button type="button" className="btn ghost" aria-label={`${t('Delete rule')}: ${ruleTitle(r)}`} onClick={() => deleteRule(r.id)}>
                <Icon name="cross" />
              </button>
            </div>
            {matches.length === 0 ? (
              <p className="small muted"><Tr text="No company matches this rule today." /></p>
            ) : (
              <ul className="small range-matches">
                {shown.map((m) => (
                  <li key={m.code}>
                    <Link href={`/c/${encodeURIComponent(m.code)}`} className="mono"><b>{m.code}</b></Link>{' — '}{matchText(m)}
                  </li>
                ))}
              </ul>
            )}
            {matches.length > SHOWN_PER_RULE ? (
              <button type="button" className="link-btn" aria-expanded={open} onClick={() => toggle(r.id)}>
                {open ? t('Show fewer') : t('Show all {n}').replace('{n}', String(matches.length))}
              </button>
            ) : null}
          </section>
        );
      })}

      {rules.length < RANGE_RULES_MAX && (
        <form onSubmit={addRule} className="range-rule-form">
          <label>
            <span><Tr text="Kind" /></span>
            <select aria-label={t('Kind')} value={kind} onChange={(e) => setKind(e.target.value as RangeRuleKind)}>
              {KIND_LABELS.map((kl) => <option key={kl.kind} value={kl.kind}>{t(kl.label)}</option>)}
            </select>
          </label>
          <label>
            <span>{t(isBuy ? 'At least %' : 'Within %')}</span>
            <input type="number" aria-label={t(isBuy ? 'At least %' : 'Within %')} value={pct} min={RANGE_PCT_MIN} max={RANGE_PCT_MAX} step="0.5"
              onChange={(e) => { setPct(e.target.value); setAddError(''); }} />
          </label>
          {!isBuy && (
            <label>
              <span><Tr text="Scope" /></span>
              <select aria-label={t('Scope')} value={scope} onChange={(e) => setScope(e.target.value as RangeScope)}>
                {SCOPE_LABELS.map((sl) => <option key={sl.scope} value={sl.scope}>{t(sl.label)}</option>)}
              </select>
            </label>
          )}
          <label>
            <span><Tr text="Quick pick" /></span>
            <select aria-label={t('Quick pick')} value={pick} onChange={(e) => setPick(e.target.value as QuickPickKey | '')}>
              <option value="">{t('Any company')}</option>
              {QUICK_PICKS.map((q) => <option key={q.key} value={q.key}>{t(q.label)}</option>)}
            </select>
          </label>
          <button type="submit" className="btn">
            <Icon name="check" /><Tr text="Add rule" />
          </button>
          {addError ? <p className="small range-rule-error" role="alert">{addError}</p> : null}
        </form>
      )}
    </div>
  );
}
