'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { fmt, fmtDate } from '@/components/format';
import { deletePlan, dropRefusedKey, listPlans, savePlan, useMode } from '@/components/portfolio-store';
import { PlanForm, type PlanDraft } from '@/components/planner/PlanForm';
import { STATUS_PILL, type LivePlan, type PlansList } from '@/components/planner/plan-text';
import css from '@/components/planner/planner.module.css';
import type { PlanStatus, SavedPlan } from '@/lib/plans';
import { Tr } from '@/components/Tr';
import { KeyStoppedNote, UnreadableNote } from '@/components/portfolio/MyData';

const STATUS_WORD: Record<PlanStatus['status'], string> = { reached: 'Target reached', waiting: 'Waiting', expired: 'Expired', done: 'Done', cancelled: 'Cancelled' };

const toDraft = (p: SavedPlan): PlanDraft => ({ code: p.code, quantity: String(p.quantity), boughtNow: String(p.boughtNow), targetPrice: p.targetPrice == null ? '' : String(p.targetPrice), until: p.until ?? '', note: p.note, status: p.status });
const toBody = (p: SavedPlan, status = p.status) => ({ ...toDraft(p), status });

function statusWord(p: LivePlan): string {
  if (p.live.status === 'waiting' && p.live.awayPct != null) return `Waiting · ${fmt(p.live.awayPct, 1)}% away`;
  return STATUS_WORD[p.live.status];
}

export default function PlansPage() {
  const { mode, ready } = useMode();
  const [data, setData] = useState<PlansList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await listPlans()); setError(null); } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load plans.');
      if ((e as { status?: number }).status === 401) dropRefusedKey();
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [ready, mode, load]);

  const put = async (id: string, body: object) => {
    await savePlan(body, id);
    setEditing(null);
    await load();
  };
  const act = async (work: () => Promise<unknown>, failed: string) => {
    setBusy(true);
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : failed); setBusy(false); }
  };
  const remove = (p: LivePlan) => {
    if (!window.confirm(`Delete the ${p.code} plan for ${p.quantity} shares?`)) return;
    void act(async () => { await deletePlan(p.id); await load(); }, 'Could not delete the plan.');
  };

  return (
    <>
      <h1><Tr text="Buy plans" /></h1>
      <p className="muted small">Make a plan from a company page with <b>Plan a buy</b>. A plan turns green when today&apos;s price is at or under your target. Learning aid, not investment advice.</p>
      <KeyStoppedNote />
      <UnreadableNote />
      {error ? <div className="note bad" role="alert">{error}</div> : null}
      {data?.badRows.length ? <div className="note warn">Rows {data.badRows.join(', ')} in the plans tab of your Google Sheet could not be read; fix them in the Sheet.</div> : null}
      {!data && (busy || !ready) ? <div className="skel" style={{ height: 120 }} aria-busy="true" aria-label="Loading plans" /> : null}
      {data && !data.plans.length ? <div className="panel empty"><p>No plans yet. Open a company and use <b>Plan a buy</b>, then <b>Save as plan</b>.</p><p><Link className="btn primary" href="/all"><Tr text="Browse companies" /></Link></p></div> : null}
      {data?.plans.map((p) => {
        const active = p.status === 'active';
        return (
          <article key={p.id} className={`panel ${css.card} ${p.live.status === 'reached' ? css.reached : ''}`} aria-label={`${p.code} plan`}>
            <div className={css.cardTop}>
              <h2 className="h3" style={{ margin: 0 }}><Link href={'/c/' + encodeURIComponent(p.code)} className="mono">{p.code}</Link> · {p.quantity} shares</h2>
              <span className={`pill ${STATUS_PILL[p.live.status]}`}>{statusWord(p)}</span>
            </div>
            {p.live.status === 'reached' ? <p style={{ fontSize: 17, fontWeight: 700, margin: '8px 0' }}>Target reached — buy the other {p.live.remaining} now</p> : <p className="small">{p.live.text}</p>}
            <div className={css.meta}>
              <span title="Counted from the buys in your Portfolio since this plan was made">Bought <b className="mono">{p.boughtNow}</b> of {p.quantity}</span>
              <span>Target <b className="mono">{p.targetPrice == null ? '—' : '৳' + fmt(p.targetPrice)}</b></span>
              <span>Now <b className="mono">{p.price == null ? '—' : '৳' + fmt(p.price)}</b></span>
              <span>Until <b>{p.until ? fmtDate(p.until) : '—'}</b></span>
            </div>
            {p.note ? <p className="small muted">{p.note}</p> : null}
            {editing === p.id ? <PlanForm initial={toDraft(p)} submitLabel="Save changes" onSubmit={(d) => put(p.id, d)} onCancel={() => setEditing(null)} /> : (
              <div className={css.buttons}>
                <button className="btn" type="button" disabled={busy} onClick={() => setEditing(p.id)}>Edit</button>
                {active ? <button className="btn" type="button" disabled={busy} onClick={() => void act(() => put(p.id, toBody(p, 'done')), 'Could not update the plan.')}>Mark done</button> : null}
                {active ? <button className="btn" type="button" disabled={busy} onClick={() => void act(() => put(p.id, toBody(p, 'cancelled')), 'Could not update the plan.')}>Cancel plan</button> : null}
                <button className="link-btn danger" type="button" disabled={busy} onClick={() => remove(p)}>Delete</button>
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}
