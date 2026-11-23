'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { fmt } from '@/components/format';
import { useLang } from '@/components/i18n';
import { useStoredValue } from '@/components/useStored';
import { Icon } from '@/components/ui';
import { call } from '@/components/trades-client';
import { listPlans, useMode } from '@/components/portfolio-store';
import type { Pick } from '@/lib/buy-planner';
import { STATUS_PILL, type PlansList } from './plan-text';
import css from './planner.module.css';

const SHOWN = 6;
interface Picks { budget: number | null; picks: Pick[]; today: string }

// Rule-based shortlist for a budget; the last budget is remembered in this browser (useStoredValue guards storage).
export function TodaysPicks() {
  const { t } = useLang();
  const [budget, setBudget] = useStoredValue('picksBudget', '');
  const [draft, setDraft] = useState<string | null>(null);
  const [data, setData] = useState<Picks | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    call<Picks>('', '/api/picks' + (budget ? '?budget=' + encodeURIComponent(budget) : ''))
      .then((d) => { if (active) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load picks.'); });
    return () => { active = false; };
  }, [budget]);

  const submit = (e: FormEvent) => { e.preventDefault(); setBudget((draft ?? budget).trim()); };

  return (
    <section className="panel" aria-labelledby="picks-title" style={{ marginTop: 14 }}>
      <h2 className="h3" id="picks-title"><Icon name="star" /> {t('Passes all 8 checks and fits your budget')}</h2>
      <p className="small muted">{t('Passes the quality checks, no warning sign, low in its 1-year range or under its 20-day average, and not sliding. Rules on past prices — a list to research, not a buy order.')}</p>
      <form className={css.ask} onSubmit={submit}>
        <label>{t('Your budget ৳')}<input type="number" min={1} step="any" value={draft ?? budget} onChange={(e) => setDraft(e.target.value)} /></label>
        <button className="btn" type="submit">{t('Show list')}</button>
      </form>
      {error ? <div className="note bad" role="alert">{error}</div> : null}
      {!data && !error ? <div className="skel" style={{ height: 120, marginTop: 10 }} aria-busy="true" aria-label={t('Loading picks')} /> : null}
      {data && !data.picks.length ? <p className="small muted">{t('No company fits these rules today.')}</p> : null}
      {data?.picks.length ? (
        <table className="cards" style={{ marginTop: 10 }}>
          <thead><tr><th scope="col">{t('Company')}</th><th scope="col" className="n">{t('Price')}</th><th scope="col" className="n">{t('Shares you can buy')}</th><th scope="col" className="n">{t('In 1-year range')}</th><th scope="col">{t('Trend')}</th></tr></thead>
          <tbody>{data.picks.slice(0, SHOWN).map((p) => (
            <tr key={p.code}>
              <td><Link href={'/c/' + encodeURIComponent(p.code)} className="mono"><b>{p.code}</b></Link> <span className="small muted">{p.name}</span></td>
              <td className="n mono" data-label={t('Price')}>৳{fmt(p.price)}</td>
              <td className="n mono" data-label={t('Shares you can buy')}>{p.shares == null ? '—' : `${p.shares} · ৳${fmt(p.cost, 0)}`}</td>
              <td className="n mono" data-label={t('In 1-year range')}>{p.position52 == null ? '—' : Math.round(p.position52 * 100) + '%'}</td>
              <td data-label={t('Trend')}>{t(p.trend ?? '—')}</td>
            </tr>))}</tbody>
        </table>) : null}
      <p className="why">{t('Learning aid, not investment advice.')}</p>
    </section>
  );
}

// Only when there is at least one open plan (this browser or the Google Sheet); reached plans come first from the API.
export function PlansMini() {
  const { t } = useLang();
  const [data, setData] = useState<PlansList | null>(null);
  const { mode, ready } = useMode();

  useEffect(() => {
    if (!ready) return;
    let active = true;
    listPlans()
      .then((d) => { if (active) setData(d); })
      .catch((e: unknown) => console.warn('dashboard: buy plans not loaded', e));
    return () => { active = false; };
  }, [ready, mode]);

  const open = data?.plans.filter((p) => p.live.status === 'reached' || p.live.status === 'waiting' || p.live.status === 'expired') ?? [];
  if (!open.length) return null;
  return (
    <section className="panel" aria-labelledby="plans-mini-title" style={{ marginBottom: 14 }}>
      <div className={css.cardTop}><h2 className="h3" id="plans-mini-title" style={{ margin: 0 }}><Icon name="target" /> {t('Your buy plans')}</h2><Link href="/plans" className="small">{t('All buy plans →')}</Link></div>
      <ul className={css.miniList} style={{ marginTop: 10 }}>
        {open.slice(0, 4).map((p) => (
          <li key={p.id}><Link href={'/c/' + encodeURIComponent(p.code)} className="mono"><b>{p.code}</b></Link>
            <span className={`pill ${STATUS_PILL[p.live.status]}`}>{p.live.status === 'reached' ? t('Target reached') : p.live.status === 'expired' ? t('Expired') : t('Waiting')}</span>
            <span className="small">{p.live.text}</span></li>))}
      </ul>
    </section>
  );
}
