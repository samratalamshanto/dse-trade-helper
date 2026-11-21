'use client';

import { useState, type FormEvent } from 'react';
import css from './planner.module.css';

export interface PlanDraft { code: string; quantity: string; boughtNow: string; targetPrice: string; until: string; note: string; status: string }

// Save-as-plan and edit share this form; the caller decides POST or PUT.
export function PlanForm({ initial, submitLabel, onSubmit, onCancel }: { initial: PlanDraft; submitLabel: string; onSubmit: (d: PlanDraft) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof PlanDraft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(d); setError(null); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the plan.'); } finally { setBusy(false); }
  };

  return (
    <form className={css.form} onSubmit={submit} aria-label={`Plan for ${d.code}`}>
      <label>Quantity<input type="number" min={1} step={1} required value={d.quantity} onChange={set('quantity')} /></label>
      <label>Target price ৳<input type="number" min={0} step="any" value={d.targetPrice} onChange={set('targetPrice')} /></label>
      <label>Until<input type="date" value={d.until} onChange={set('until')} /></label>
      <label>Note<input type="text" maxLength={200} value={d.note} onChange={set('note')} /></label>
      <div className={css.buttons}>
        <button className="btn primary" type="submit" disabled={busy}>{submitLabel}</button>
        <button className="link-btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  );
}
