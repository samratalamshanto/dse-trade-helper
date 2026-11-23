'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { Icon } from '@/components/ui';
import { useStoredValue } from '@/components/useStored';
import {
  parseRangeRules, rangeFeed, describeMatch,
  RANGE_RULES_STORE, RANGE_RULES_MAX, RANGE_PCT_MIN, RANGE_PCT_MAX,
  type RangeRow, type RangeRule, type RangeRuleKind, type RangeScope, type Owned,
} from '@/lib/range';

interface Props {
  rows: readonly RangeRow[];
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

export function MyRules({ rows, watchlist, holdings }: Props) {
  const { t } = useLang();
  const [rawRules, setRawRules] = useStoredValue(RANGE_RULES_STORE, '[]');
  const rules = useMemo<RangeRule[]>(() => {
    try { return parseRangeRules(JSON.parse(rawRules)); } catch { return []; }
  }, [rawRules]);

  const [kind, setKind] = useState<RangeRuleKind>('nearLow');
  const [pct, setPct] = useState('10');
  const [scope, setScope] = useState<RangeScope>('all');
  const [addError, setAddError] = useState('');

  const feed = useMemo(() => rangeFeed(rules, { rows, watchlist, holdings }), [rules, rows, watchlist, holdings]);

  function deleteRule(id: string) {
    setRawRules(JSON.stringify(rules.filter((r) => r.id !== id)));
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
    const newRule: RangeRule = { id: crypto.randomUUID(), kind, pct: n, scope: BUY_KINDS.has(kind) ? 'holdings' : scope };
    setRawRules(JSON.stringify([...rules, newRule]));
    setPct('10');
    setAddError('');
  }

  const isBuy = BUY_KINDS.has(kind);

  return (
    <div className="panel">
      <h2 className="h3" id="my-rules-heading"><Tr text="My rules" /></h2>
      {feed.length > 0 ? (
        <ul className="small" aria-label={t('Rule matches')} style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
          {feed.map((m, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>
              <Link href={`/c/${encodeURIComponent(m.code)}`} className="mono"><b>{m.code}</b></Link>
              {' — '}{describeMatch(m)}
            </li>
          ))}
        </ul>
      ) : rules.length > 0 ? (
        <p className="small muted"><Tr text="No company matches your rules today." /></p>
      ) : (
        <p className="small muted"><Tr text="No rules yet: add one below." /></p>
      )}

      {rules.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
          {rules.map((r) => {
            const kl = KIND_LABELS.find((k) => k.kind === r.kind)?.label ?? r.kind;
            const sl = SCOPE_LABELS.find((s) => s.scope === r.scope)?.label ?? r.scope;
            return (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="small">{t(kl)} {r.pct}%{!BUY_KINDS.has(r.kind) ? ` · ${t(sl)}` : ''}</span>
                <button type="button" className="btn ghost" style={{ minHeight: '32px', padding: '2px 8px', fontSize: '12px' }}
                  aria-label={`${t('Delete rule')}: ${t(kl)} ${r.pct}%`}
                  onClick={() => deleteRule(r.id)}>
                  <Icon name="cross" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {rules.length < RANGE_RULES_MAX && (
        <form onSubmit={addRule} style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
            <span><Tr text="Kind" /></span>
            <select value={kind} onChange={(e) => setKind(e.target.value as RangeRuleKind)}
              aria-label={t('Rule kind')} style={{ minWidth: '170px' }}>
              {KIND_LABELS.map((kl) => <option key={kl.kind} value={kl.kind}>{t(kl.label)}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
            <span><Tr text="Within %" /></span>
            <input type="number" value={pct} min={RANGE_PCT_MIN} max={RANGE_PCT_MAX} step="0.5"
              aria-label={t('Percentage threshold')} style={{ width: '80px' }}
              onChange={(e) => { setPct(e.target.value); setAddError(''); }} />
          </label>
          {!isBuy && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              <span><Tr text="Scope" /></span>
              <select value={scope} onChange={(e) => setScope(e.target.value as RangeScope)}
                aria-label={t('Rule scope')}>
                {SCOPE_LABELS.map((sl) => <option key={sl.scope} value={sl.scope}>{t(sl.label)}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="btn">
            <Icon name="check" /><Tr text="Add rule" />
          </button>
          {addError && <p className="small" style={{ color: 'var(--down)', margin: '0', flexBasis: '100%' }}>{addError}</p>}
        </form>
      )}
    </div>
  );
}
