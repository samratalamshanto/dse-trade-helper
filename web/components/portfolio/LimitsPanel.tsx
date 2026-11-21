'use client';

import { useState, type FormEvent } from 'react';
import type { LimitSettings } from '@/lib/positions';
import css from '@/app/portfolio/trades.module.css';

type Draft = { stopPct: string; targetPct: string };
const toDraft = (l: { stopPct: number; targetPct: number }): Draft => ({ stopPct: String(l.stopPct), targetPct: String(l.targetPct) });
const toLimits = (d: Draft) => ({ stopPct: Number(d.stopPct), targetPct: Number(d.targetPct) });

function LimitInputs({ name, draft, onChange }: { name: string; draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <>
      <label>{name} stop-loss %<input type="number" min={1} max={95} step="any" required value={draft.stopPct} onChange={(e) => onChange({ ...draft, stopPct: e.target.value })} /></label>
      <label>{name} target %<input type="number" min={1} max={95} step="any" required value={draft.targetPct} onChange={(e) => onChange({ ...draft, targetPct: e.target.value })} /></label>
    </>
  );
}

// Editable copy of the saved limits; the parent remounts it (key) whenever the saved settings change.
export function LimitsPanel({ settings, held, onSave }: { settings: LimitSettings; held: string[]; onSave: (s: LimitSettings) => Promise<void> }) {
  const [def, setDef] = useState(() => toDraft(settings.default));
  const [overrides, setOverrides] = useState(() => Object.entries(settings.perCode).map(([code, l]) => ({ code, ...toDraft(l) })));
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const free = held.filter((c) => !overrides.some((o) => o.code === c));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ default: toLimits(def), perCode: Object.fromEntries(overrides.map((o) => [o.code, toLimits(o)])) });
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the limits.'); } finally { setBusy(false); }
  };

  return (
    <form className={`panel ${css.section}`} onSubmit={submit} aria-labelledby="limits-title">
      <h2 className="h3" id="limits-title">My limits</h2>
      <p className="muted small">The checks flag a holding when it falls past your stop-loss or rises past your target, measured from your average cost.</p>
      <div className={css.form}><LimitInputs name="Default" draft={def} onChange={setDef} /></div>
      {overrides.map((o) => (
        <div key={o.code} className={`${css.form} ${css.section}`}>
          <LimitInputs name={o.code} draft={o} onChange={(d) => setOverrides((all) => all.map((x) => (x.code === o.code ? { ...x, ...d } : x)))} />
          <div className={css.actions}><button className="link-btn" type="button" onClick={() => setOverrides((all) => all.filter((x) => x.code !== o.code))}>Remove {o.code} override</button></div>
        </div>
      ))}
      <div className={`${css.form} ${css.section}`}>
        {free.length ? (
          <>
            <label>Holding with its own limits<select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a holding</option>{free.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className={css.actions}><button className="btn" type="button" disabled={!pick} onClick={() => { setOverrides((all) => [...all, { code: pick, ...def }]); setPick(''); }}>Add override</button></div>
          </>
        ) : null}
        <div className={css.actions}><button className="btn primary" type="submit" disabled={busy}>Save limits</button></div>
      </div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  );
}
