'use client';

import Link from 'next/link';
import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { fmt } from '@/components/format';
import { bnDigits, useLang } from '@/components/i18n';
import { Info } from '@/components/ui';
import { call, readKey } from '@/components/trades-client';
import { holdingQuery, savePlan } from '@/components/portfolio-store';
import { dhakaToday } from '@/lib/dhaka';
import type { BuyPlan, SellEase as Ease } from '@/lib/buy-planner';
import { PlanForm, type PlanDraft } from './PlanForm';
import { moveSentence, plusTradingDays, TONE_PILL } from './plan-text';
import css from './planner.module.css';

const PLAN_DAYS = 10;

function splitLine(p: BuyPlan): string {
  if (p.buyNow === 0) return p.alertPrice != null ? `Buy none now · all ${p.later} at ৳${fmt(p.alertPrice)} or lower` : 'Buy none now';
  if (p.later === 0) return `Buy all ${p.buyNow} now · ৳${fmt(p.price * p.buyNow)}`;
  return `Buy ${p.buyNow} now · ${p.later} later at ৳${fmt(p.alertPrice)}`;
}

const draftFrom = (p: BuyPlan): PlanDraft => ({
  code: p.code, quantity: String(p.quantity), boughtNow: '0', targetPrice: p.alertPrice == null ? '' : String(p.alertPrice),
  until: plusTradingDays(dhakaToday(), PLAN_DAYS), note: p.label, status: 'active',
});

const SELL_HINT = 'Days of normal trading = the value of the shares ÷ the average value traded a day over the last 20 days. More days means selling takes longer or moves the price more.';

// "1,000 shares (৳7,03,500) ≈ 1.7 days of its normal trading", with a thin-trading mark.
export function SellEase({ what, ease }: { what: ReactNode; ease: Ease | null }) {
  const { t, lang } = useLang();
  const num = (s: string) => (lang === 'bn' ? bnDigits(s) : s);
  if (!ease) return <>—</>;
  return (
    <>{what}{Number.isFinite(ease.days) ? <> ≈ <span className="mono">{num(ease.days < 0.1 ? '< 0.1' : fmt(ease.days, ease.days < 10 ? 1 : 0))}</span> {t('days of its normal trading')}</> : <>: {t('no trades in the last 20 days')}</>}
      {ease.thin ? <> <span className="pill s-caution">{t('Thin trading')}</span></> : null} <Info text={t(SELL_HINT)} /></>
  );
}

function Result({ p, bar }: { p: BuyPlan; bar: ReactNode }) {
  const { t } = useLang();
  const sentence = moveSentence(p.moveOdds);
  return (
    <div className={css.result}>
      <div className={css.action}>
        <span className={`pill ${css.badge} ${TONE_PILL[p.tone] ?? 's-neutral'}`} data-action={p.action}>{t(p.label)}</span>
        <span className={`mono ${css.split}`}>{t(splitLine(p))}</span>
      </div>
      <ul className="reasons">{p.reasons.map((r, i) => <li key={i + r}><span>{t(r)}</span></li>)}</ul>
      {p.warnings.length ? <div className="note warn" role="note"><b>{t('Watch out')}:</b><ul>{p.warnings.map((w, i) => <li key={i + w}>{t(w)}</li>)}</ul></div> : null}
      <div className={css.facts}>
        <div>
          <h4>{t("Where today's price stands")}</h4>
          {bar}
          <p className="small">{t('20-day average')}: <span className="mono">{p.sma20 == null ? '—' : '৳' + fmt(p.sma20)}</span>
            {p.vsSma20Pct != null ? <> ({p.vsSma20Pct < 0 ? t(`${fmt(Math.abs(p.vsSma20Pct), 1)}% below`) : t(`${fmt(Math.abs(p.vsSma20Pct), 1)}% above`)})</> : null}</p>
          <p className="small">{t('Trend')}: <span className={`pill ${p.trend === 'rising' ? 's-research' : p.trend === 'falling' ? 's-avoid' : 's-neutral'}`}>{t(p.trend ?? 'not enough history')}</span></p>
        </div>
        <div>
          <h4>{t('What usually happened')} <Info text={t(`Share of the last ${p.sample} trading days followed, within 5 trading days, by a close this much lower or higher.`) + ' ' + t('History, not a forecast.')} /></h4>
          <table className={css.odds}>
            <thead><tr><th scope="col">{t('Move')}</th><th scope="col" className="n">{t('Fell within 5 days')}</th><th scope="col" className="n">{t('Rose within 5 days')}</th></tr></thead>
            <tbody>{p.moveOdds.map((o) => <tr key={o.pct}><th scope="row">{o.pct}%</th><td className="n mono">{o.fell == null ? '—' : o.fell + '%'}</td><td className="n mono">{o.rose == null ? '—' : o.rose + '%'}</td></tr>)}</tbody>
          </table>
          {sentence ? <p className="small">{t(sentence)}</p> : null}
        </div>
      </div>
      {p.dividend ? <p className="small">{t('Dividend')}: {t(`own it at the end of ${p.dividend.lastBuyDate} (${p.dividend.tradingDaysLeft} trading days left)`)}{p.dividend.cashPerShare != null ? ` · ${t(`৳${fmt(p.dividend.cashPerShare)} a share`)}` : ''}.</p> : null}
      <p className="small">{t('Planned cost')}: {t(`৳${fmt(p.totalWithCommission)} = ${p.quantity} shares at an average ৳${fmt(p.avgPrice)} + ৳${fmt(p.commission)} broker commission`)}
        <Info text={t(`Commission is an estimate at ${p.commissionPct}% of the trade value (brokers charge about 0.3–0.5%, levies included).`) + ' ' + t('Ask your broker for the exact rate.')} /></p>
      {p.sellEase ? <p className="small">{t('How easy to sell')}: <SellEase what={t(`${p.quantity} shares (৳${fmt(p.cost, 0)})`)} ease={p.sellEase} /></p> : null}
      {p.afterBuy ? <p className="small">{t(p.later > 0 && p.alertPrice != null ? 'After this buy, if the alert price fills' : 'After this buy')}: {t(`${p.afterBuy.shares} shares at an average ৳${fmt(p.afterBuy.avgCost)}`)}{p.afterBuy.weightPct != null ? ` · ${t(`${fmt(p.afterBuy.weightPct, 0)}% of your holdings`)}` : ` · ${t('add your trades on Portfolio to see its share of your holdings')}`}.</p> : null}
      <p className="why">{t('Rules on past prices: what happened before, never a forecast. Learning aid, not investment advice.')}</p>
    </div>
  );
}

// "Plan a buy" on the company page: shares or a budget → /api/plan, with the holding from the Sheet (key) or from this browser.
export function BuyPlanner({ code, bar }: { code: string; bar: ReactNode }) {
  const { t } = useLang();
  const [mode, setMode] = useState<'qty' | 'budget'>('qty');
  useEffect(() => {
    if (window.location.hash === '#planner-title') document.getElementById('planner-title')?.scrollIntoView();
  }, []);
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState<BuyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<'form' | 'saved' | null>(null);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaving(null);
    try {
      setPlan(await call<BuyPlan>(readKey(), `/api/plan/${encodeURIComponent(code)}?${mode}=${encodeURIComponent(amount)}${await holdingQuery(code)}`));
      setError(null);
    } catch (err) { setPlan(null); setError(err instanceof Error ? err.message : t('Could not make a plan.')); } finally { setBusy(false); }
  };

  const save = async (d: PlanDraft) => {
    await savePlan(d);
    setSaving('saved');
  };

  return (
    <section className="panel" aria-labelledby="planner-title">
      <div className={css.head}><h3 id="planner-title">{t('Plan a buy')}</h3><span className="small muted">{t('Learning aid, not investment advice')}</span></div>
      <form className={css.ask} onSubmit={ask}>
        <div className={css.toggle} role="group" aria-label={t('Plan by')}>
          <button type="button" className="btn" aria-pressed={mode === 'qty'} onClick={() => { setMode('qty'); setPlan(null); setError(null); }}>{t('Shares')}</button>
          <button type="button" className="btn" aria-pressed={mode === 'budget'} onClick={() => { setMode('budget'); setPlan(null); setError(null); }}>{t('Budget ৳')}</button>
        </div>
        <label>{mode === 'qty' ? t('How many shares') : t('How much taka')}
          <input type="number" min={1} step={mode === 'qty' ? 1 : 'any'} required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <button className={plan ? 'btn' : 'btn primary'} type="submit" disabled={busy}>{t('Plan it')}</button>
      </form>
      {error ? <div className="note bad" role="alert">{error}</div> : null}
      {plan ? (
        <>
          <Result p={plan} bar={bar} />
          {saving === 'form' ? <PlanForm initial={draftFrom(plan)} submitLabel={t('Save plan')} onSubmit={save} onCancel={() => setSaving(null)} /> : (
            <div className={css.buttons}>
              {saving === 'saved' ? null : <button className="btn primary" type="button" onClick={() => setSaving('form')}>{t('Save as plan')}</button>}
              {saving === 'saved' ? <span className="small t-good" role="status">{t('Saved.')} <Link href="/plans">{t('See my buy plans →')}</Link></span> : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
