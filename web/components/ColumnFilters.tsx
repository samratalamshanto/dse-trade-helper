'use client';

import { useLang } from '@/components/i18n';
import { Icon } from '@/components/ui';
import { COLUMN_FIELDS, DIV_STATES, OPS, type Condition, type DivState, type FieldKey, type Op } from '@/lib/column-filters';

interface Props {
  conditions: readonly Condition[];
  states: readonly DivState[];
  onChange: (conditions: Condition[], states: DivState[]) => void;
}

// One row per condition; several rows on one column combine (Price > 5 and Price < 20).
export function ColumnFilters({ conditions, states, onChange }: Props) {
  const { t } = useLang();
  const setRow = (i: number, patch: Partial<Condition>) =>
    onChange(conditions.map((c, j) => (j === i ? { ...c, ...patch, ...(patch.field && (patch.field === 'rec') !== (c.field === 'rec') ? { value: '' } : {}) } : c)), [...states]);
  const toggleState = (s: DivState) => onChange([...conditions], states.includes(s) ? states.filter((x) => x !== s) : [...states, s]);

  return (
    <div className="col-filters">
      <div className="col-filter-row" role="group" aria-label={t('Dividend date')}>
        <span className="small muted">{t('Dividend date')}:</span>
        {DIV_STATES.map(([k, label]) => (
          <button key={k} type="button" className={`btn chip${states.includes(k) ? ' active' : ''}`} aria-pressed={states.includes(k)} onClick={() => toggleState(k)}>{t(label)}</button>
        ))}
      </div>
      {conditions.map((c, i) => (
        <div key={i} className="col-filter-row" role="group" aria-label={`${t('Filter')} ${i + 1}`}>
          <select aria-label={t('Column')} value={c.field} onChange={(e) => setRow(i, { field: e.target.value as FieldKey })}>
            {COLUMN_FIELDS.map((f) => <option key={f.key} value={f.key}>{t(f.label)}</option>)}
          </select>
          <select aria-label={t('Compare')} value={c.op} onChange={(e) => setRow(i, { op: e.target.value as Op })}>
            {OPS.map(([k, sym]) => <option key={k} value={k}>{sym}</option>)}
          </select>
          {c.field === 'rec'
            ? <input type="date" aria-label={t('Value')} value={c.value} onChange={(e) => setRow(i, { value: e.target.value })} />
            : <input type="number" step="any" aria-label={t('Value')} placeholder="0" value={c.value} onChange={(e) => setRow(i, { value: e.target.value })} />}
          <button type="button" className="btn ghost" aria-label={t('Remove this filter')} onClick={() => onChange(conditions.filter((_, j) => j !== i), [...states])}><Icon name="cross" /></button>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => onChange([...conditions, { field: 'score', op: 'gt', value: '' }], [...states])}>
        + {t('Add a filter')}</button>
    </div>
  );
}
