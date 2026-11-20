'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useApi } from '@/components/AppProvider';
import { ChangeText } from '@/components/CompanyCard';
import { HeaderStats, Overview, RangeBar52 } from '@/components/company/Overview';
import { Dividends } from '@/components/company/Dividends';
import { Financials } from '@/components/company/Financials';
import { Owners, Safety } from '@/components/company/SafetyOwners';
import { Valuation } from '@/components/company/Valuation';
import { News } from '@/components/company/News';
import Link from 'next/link';
import { useLang } from '@/components/i18n';
import { WatchButton } from '@/components/Watchlist';
import { fmt, fmtDate, sectorName } from '@/components/format';
import { CATEGORY_TEXT } from '@/lib/glossary';
import { FRAUD, Icon, Info, SIGNALS, SignalPill, type FraudLevel, type IconName, type Signal } from '@/components/ui';
import type { CompanyDetail } from '@/lib/service';

const TABS = [['overview', 'Overview'], ['valuation', 'Cheap or expensive'], ['financials', '5-year financials'], ['dividends', 'Dividends'], ['news', 'News'], ['safety', 'Safety checks'], ['owners', 'Owners']] as const;
type Tab = (typeof TABS)[number][0];

const ANSWER_UI: Record<string, [string, string, IconName]> = {
  yes: ['Yes', 't-good', 'research'], partly: ['Partly', 't-warn', 'caution'], no: ['No', 't-bad', 'avoid'], unknown: ['Unknown', 't-neutral', 'neutral'],
};
// The fraud answer uses the same Clean / Suspicious / High risk words as every other screen.
const FRAUD_QUESTION = 'Any fraud warning signs?';
const NOT_RATED = 'Not rated — no EPS published';
const NOTE_TONE: Record<Signal, string> = { research: 'good', avoid: 'bad', caution: 'warn', neutral: '' };

export function CompanyView({ code }: { code: string }) {
  const { t } = useLang();
  const { data: d, error } = useApi<CompanyDetail>(code ? '/api/company/' + encodeURIComponent(code) : null);
  const [tab, setTab] = useState<Tab>('overview');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tablist = useRef<HTMLDivElement>(null);

  if (error && !d) {
    const missing = /no company/i.test(error);
    return <div className="note bad">{t('Could not load')} {code}: {error.replace(/\.$/, '')}. {t(missing ? 'Check the trade code.' : 'Check the code, or try again in a minute.')}</div>;
  }
  if (!d) {
    return (
      <div aria-busy="true" aria-label={t('Loading company')}><div className="skel" style={{ height: 170 }} />
        <div className="grid g4" style={{ marginTop: 14 }}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="skel" style={{ height: 64 }} />)}</div></div>
    );
  }

  const c = d.company, a = d.analysis, signal = a.signal as Signal;
  const show = (k: Tab, focus = true) => { setTab(k); if (focus) requestAnimationFrame(() => tabRefs.current[k]?.focus()); };
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex(([k]) => k === tab), n = TABS.length;
    const to = ({ ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to != null) { e.preventDefault(); show(TABS[to][0]); }
  };

  return (
    <>
      <div className="panel hero">
        <div className="hero-top">
          <div><h1>{c.name}</h1><div className="muted mono small">{c.code} · {sectorName(c.sector)} · {t('Category')} {c.category} · {t('Listed')} {c.listingYear}</div>
            {CATEGORY_TEXT[c.category] ? <div className={`small ${c.category === 'Z' ? 't-bad' : 'muted'}`}>{t(CATEGORY_TEXT[c.category])}</div> : null}
            <div className="hero-actions"><WatchButton code={c.code} withText /><Link className="btn" href={'/compare?codes=' + encodeURIComponent(c.code)}>{t('Compare with others')}</Link></div></div>
          <div className="hero-price"><div className="mono" style={{ fontSize: 28, fontWeight: 600 }}>৳{fmt(c.price)}</div><div className="mono small"><ChangeText pct={c.changePct} suffix=" today" /></div>
            <div className="small muted">{t('DSE data')}: {d.session?.dataTime || fmtDate(d.session?.sessionDate)} · {t('source')} dse.com.bd</div>
            {d.freshSkipped ? <div className="small t-warn" role="status">{t('DSE is busy, so this is the saved copy. Try Refresh in a minute.')}</div> : null}
            <RangeBar52 c={c} compact /><HeaderStats d={d} /></div>
        </div>
        <div className="verdict">
          <Link href="/learn#signals" className="signal-link" aria-label={`${t(a.notRated ? NOT_RATED : SIGNALS[signal].label)}: ${t('what the signals mean')}`}>
            {a.notRated ? <span className="pill s-neutral big-pill"><Icon name="neutral" /> {t(NOT_RATED)}</span> : <SignalPill signal={signal} big />}</Link>{' '}
{a.notRated ? null : (
          <span className="mono small muted">{t('Score')} {a.score}/100 <Info text="Each signal has its own range. Avoid 0–30, Caution 31–60, No strong signal 61–75, Worth researching 76–100." /></span>)}
        </div>
        <div className={`note ${NOTE_TONE[signal]}`}><b>{t('Suggestion')}:</b> {t(a.suggestion).split(/(disclosures)/).map((part, i) => (part === 'disclosures'
          ? <button key={i} type="button" className="link-btn" onClick={() => { show('news', false); tablist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{part}</button>
          : part))}</div>
      </div>

      <h2 className="sr-title">{t('Four questions before you buy')}</h2>
      <div className="grid g4 questions">
        {d.questions.map((q) => {
          const [label, cls, icon] = ANSWER_UI[q.answer] ?? ANSWER_UI.unknown;
          return (
            <button key={q.q} type="button" className="panel qcard" onClick={() => { show(q.tab as Tab, false); tablist.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <div className="small muted">{t(q.q)}</div>
              <div className={`qans ${cls}`}><Icon name={icon} /> {t(q.q === FRAUD_QUESTION ? FRAUD[a.fraud.level as FraudLevel] : q.label || label)}</div>
              <div className="small">{t(q.text)}</div><div className="small more">{t('See details →')}</div>
            </button>
          );
        })}
      </div>

      <div className="tabs" role="tablist" aria-label={t('Company details')} ref={tablist} onKeyDown={onKey}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={'tab-' + k} aria-controls="pane" aria-selected={k === tab} tabIndex={k === tab ? 0 : -1}
            ref={(el) => { tabRefs.current[k] = el; }} onClick={() => show(k)}>{t(label)}</button>
        ))}
      </div>
      <div id="pane" role="tabpanel" tabIndex={0} aria-labelledby={'tab-' + tab}>
        {tab === 'overview' ? <Overview d={d} /> : null}
        {tab === 'valuation' ? <Valuation p={d.position} /> : null}
        {tab === 'financials' ? <Financials s={d.summary} years={c.years} dividends={c.dividends} face={c.faceValue || 10} interim={c.interim} lastYearEps={a.metrics.epsNow ?? null} /> : null}
        {tab === 'dividends' ? <Dividends d={d} /> : null}
        {tab === 'news' ? <News news={c.news} code={c.code} /> : null}
        {tab === 'safety' ? <Safety a={a} /> : null}
        {tab === 'owners' ? <Owners c={c} /> : null}
      </div>
      <p className="why">{t('Data as of')} {d.session?.dataTime || fmtDate(d.session?.sessionDate)} · {t('Source: DSE public website')}.{' '}<a href={'https://www.dse.com.bd/company/' + encodeURIComponent(c.code)} target="_blank" rel="noopener noreferrer">{t('Open on DSE ↗')}</a></p>
    </>
  );
}
