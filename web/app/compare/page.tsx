'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Line } from 'react-chartjs-2';
import { useApi, useApp } from '@/components/AppProvider';
import { ChangeText } from '@/components/CompanyCard';
import { ChartBox, useChartColors, type Colors } from '@/components/charts';
import { fmt, fmtDate, moneyPerDay, pctNum, sectorName, signed } from '@/components/format';
import { FraudPill, Icon, SignalPill, Skeleton, type FraudLevel, type Signal } from '@/components/ui';
import { useLang } from '@/components/i18n';
import { PillPopover } from '@/components/PillPopover';
import type { CompanyDetail, CompanyRow } from '@/lib/service';
import { CODE_RE } from '@/lib/dhaka';

const MAX = 4;
const pct = (x: number | null | undefined, digits: number) => (x == null ? '—' : fmt(x, digits) + '%');
const LINE_COLORS: (keyof Colors)[] = ['--accent', '--up', '--warn', '--down'];

function useCompanies(codes: string[]): { data: Record<string, CompanyDetail>; errors: Record<string, string> } {
  const { tick } = useApp();
  const [state, setState] = useState<{ data: Record<string, CompanyDetail>; errors: Record<string, string> }>({ data: {}, errors: {} });
  const key = codes.join(',');
  useEffect(() => {
    const controller = new AbortController();
    const settle = (code: string, d: CompanyDetail | null, err: string | null) => setState((s) => {
      const data = { ...s.data }, errors = { ...s.errors };
      if (d) { data[code] = d; delete errors[code]; } else { delete data[code]; errors[code] = err || 'failed'; }
      return { data, errors };
    });
    for (const code of key.split(',').filter(Boolean)) {
      fetch('/api/company/' + encodeURIComponent(code), { signal: controller.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          settle(code, res.ok ? body as CompanyDetail : null, res.ok ? null : (body as { error?: string }).error || `HTTP ${res.status}`);
        })
        .catch(() => { if (!controller.signal.aborted) settle(code, null, 'network error, try Refresh'); });
    }
    return () => controller.abort();
  }, [key, tick]);
  return state;
}

type Better = 'low' | 'high' | null;
interface RowDef { label: string; value: (d: CompanyDetail) => number | null; show: (d: CompanyDetail) => ReactNode; better: Better }

const TONE_PILL: Record<string, string> = { good: 's-research', warn: 's-caution', bad: 's-avoid', neutral: 's-neutral' };

// One short line under the verdict pill, so a low P/E next to "Cheap for a reason" is explained.
const VERDICT_REASON: Record<string, string> = {
  value: 'Low P/E for this company, earnings growing', trap: 'Low P/E for this company, earnings shrinking',
  expensive: 'High P/E for this company, earnings growing', risky: 'High P/E for this company, earnings shrinking', fair: 'P/E in its usual range',
};

const ROWS: RowDef[] = [
  { label: 'Price', value: () => null, show: (d) => '৳' + fmt(d.company.price), better: null },
  { label: 'Today', value: () => null, show: (d) => <ChangeText pct={d.company.changePct} />, better: null },
  { label: 'Signal', value: (d) => (d.analysis.notRated ? null : d.analysis.score), show: (d) => (d.analysis.notRated ? <span className="pill s-neutral"><Tr text="Not rated — no EPS published" /></span> : <><SignalPill signal={d.analysis.signal as Signal} href={'/c/' + encodeURIComponent(d.company.code)} missed={d.analysis.checks.filter((x) => !x.ok).map((x) => x.label).slice(0, 3)} /> <span className="mono small">{d.analysis.score}</span></>), better: 'high' },
  { label: 'Warning-sign check', value: () => null, show: (d) => <FraudPill level={d.analysis.fraud.level as FraudLevel} href={'/c/' + encodeURIComponent(d.company.code) + '#safety'} flags={d.analysis.fraud.flags.map((f) => f.title)} />, better: null },
  { label: 'Cheap or expensive', value: () => null, show: (d) => { const v = d.position?.verdict; return v ? <><PillPopover className={`pill ${TONE_PILL[v.tone]}`} pill={<Tr text={v.label} />} meaning={v.text} href={'/c/' + encodeURIComponent(d.company.code)} /><div className="small muted"><Tr text={VERDICT_REASON[v.key] ?? ''} /></div></> : '—'; }, better: null },
  { label: 'P/E', value: (d) => d.analysis.metrics.pe ?? null, show: (d) => fmt(d.analysis.metrics.pe, 1), better: 'low' },
  { label: 'Sector P/E', value: () => null, show: (d) => fmt(d.sectorPe, 1), better: null },
  { label: 'P/B', value: (d) => d.analysis.metrics.pb ?? null, show: (d) => fmt(d.analysis.metrics.pb, 2), better: 'low' },
  { label: 'EPS (last year)', value: () => null, show: (d) => (d.analysis.metrics.epsNow != null ? '৳' + fmt(d.analysis.metrics.epsNow) : '—'), better: null },
  { label: 'NAV per share', value: () => null, show: (d) => (d.company.nav != null ? '৳' + fmt(d.company.nav) : '—'), better: null },
  { label: 'EPS growth a year', value: (d) => d.analysis.metrics.epsCagr ?? null, show: (d) => signed(d.analysis.metrics.epsCagr), better: 'high' },
  { label: 'Return on equity', value: (d) => d.summary.years.at(-1)?.roe ?? null, show: (d) => pct(d.summary.years.at(-1)?.roe, 1), better: 'high' },
  { label: '12-month cash yield', value: (d) => d.analysis.metrics.latestYield ?? null, show: (d) => pct(d.analysis.metrics.latestYield, 2), better: 'high' },
  { label: 'Next dividend', value: () => null, show: (d) => (d.dividend?.upcoming ? `${pctNum(d.dividend.upcoming.cashPct)}% cash` : 'none announced'), better: null },
  { label: 'Next record date', value: () => null, show: (d) => (d.dividend?.upcoming ? fmtDate(d.dividend.upcoming.recordDate) : '—'), better: null },
  { label: 'Traded a day', value: (d) => d.analysis.metrics.avgDailyValue ?? null, show: (d) => moneyPerDay(d.analysis.metrics.avgDailyValue), better: 'high' },
  { label: '1-year price change', value: () => null, show: (d) => signed(d.analysis.metrics.change1y), better: null },
];

function bestCode(def: RowDef, list: [string, CompanyDetail][]): string | null {
  if (!def.better || list.length < 2) return null;
  const vals = list.map(([code, d]) => [code, def.value(d)] as const).filter((x): x is readonly [string, number] => x[1] != null && Number.isFinite(x[1]));
  if (vals.length < 2) return null;
  return vals.reduce((a, b) => ((def.better === 'low' ? b[1] < a[1] : b[1] > a[1]) ? b : a))[0];
}

function Compare() {
  const { t, lang } = useLang();
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const codes = useMemo(() => [...new Set((params.get('codes') || '').split(',').map((c) => c.trim().toUpperCase()).filter((c) => CODE_RE.test(c)))].slice(0, MAX), [params]);
  const { data: all } = useApi<{ rows: CompanyRow[]; session: null }>('/api/companies');
  const { data, errors } = useCompanies(codes);
  const colors = useChartColors();
  const [pick, setPick] = useState('');
  const [pickError, setPickError] = useState('');
  const known = useMemo(() => new Set((all?.rows || []).map((r) => r.code)), [all]);
  const setCodes = (next: string[]) => router.replace(pathname + (next.length ? '?codes=' + next.map(encodeURIComponent).join(',') : ''), { scroll: false });
  // A code that failed to load gives its slot back, so it never blocks adding a valid one.
  const usable = codes.filter((c) => !errors[c]);
  const table = useRef<HTMLDivElement>(null);
  const added = useRef('');
  // On a phone the table is below the fold, so after Add it scrolls into view once the new company loads.
  useEffect(() => {
    const el = table.current;
    if (!el || !added.current) return;
    if (errors[added.current]) { added.current = ''; return; }
    if (!data[added.current]) return;
    added.current = '';
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.75 && r.bottom > 0) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [data, errors]);
  const add = () => {
    const c = pick.trim().toUpperCase();
    if (!CODE_RE.test(c) || (known.size && !known.has(c))) { setPickError(`${t('No DSE company with the code')} "${c}".`); return; }
    setPickError('');
    if (!usable.includes(c) && usable.length < MAX) { added.current = c; setCodes([...usable, c]); }
    setPick('');
  };
  const loaded = codes.filter((c) => data[c]).map((c) => [c, data[c]] as [string, CompanyDetail]);
  const loading = codes.filter((c) => !data[c] && !errors[c]);
  const years = [...new Set(loaded.flatMap(([, d]) => d.summary.years.map((y) => y.year)))].sort();

  return (
    <>
      <h1><Tr text="Compare companies" /></h1>
      <p className="muted">{lang === 'bn' ? `সর্বোচ্চ ${MAX} টি কোম্পানি পাশাপাশি।` : `Up to ${MAX} companies side by side.`} {t('"best" marks the strongest value in rows where a clear better direction exists.')}</p>
      <div className="filters">
        <label className="field" style={{ minWidth: 220 }}>{t('Add a company')}
          <input list="compare-codes" value={pick} onChange={(e) => { setPick(e.target.value); setPickError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder={t('Type a code, e.g. GP')} disabled={usable.length >= MAX} aria-invalid={!!pickError} aria-describedby={pickError ? 'pick-error' : undefined} /></label>
        <datalist id="compare-codes">{(all?.rows || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</datalist>
        <button type="button" className="btn primary" onClick={add} disabled={usable.length >= MAX || !pick.trim()}>{t('Add')}</button>
        {codes.map((c) => <button key={c} type="button" className="btn" onClick={() => setCodes(codes.filter((x) => x !== c))} aria-label={`Remove ${c} from comparison`}>{c} ✕</button>)}
      </div>
      {pickError ? <p id="pick-error" className="note bad" role="alert">{pickError}</p> : null}
      {codes.filter((c) => errors[c]).map((c) => <div key={c} className="note bad">{t('Could not load')} {c}: {errors[c].replace(/\.$/, '')}. {t('Remove it with its ✕ button.')}</div>)}
      {loading.length ? <p className="muted" aria-live="polite">{t('Loading…')} {loading.join(', ')}</p> : null}
      {!codes.length ? <div className="panel empty-state"><p><b>{t('Pick at least two companies.')}</b></p><p className="muted">{t('Type a code above, or open a company and press "Compare with others".')}</p></div> : null}
      {loaded.length > 1 ? <p className="small muted scroll-hint">{t('Swipe the table sideways to see every company →')}</p> : null}
      {loaded.length ? (
        <div className="panel table-wrap" ref={table}><table className="compare">
          <thead><tr><th><Tr text="Measure" /></th>{loaded.map(([c, d]) => <th key={c}><Link href={'/c/' + encodeURIComponent(c)} className="mono link-btn">{c}</Link><div className="small muted">{sectorName(d.company.sector)}</div></th>)}</tr></thead>
          <tbody>{ROWS.map((def) => {
            const best = bestCode(def, loaded);
            return <tr key={def.label}><th scope="row"><Tr text={def.label} /></th>{loaded.map(([c, d]) => <td key={c} className={best === c ? 'best' : ''}>{def.show(d)}{best === c ? <span className="best-tag"><Icon name="check" /><Tr text="best" /></span> : null}</td>)}</tr>;
          })}</tbody>
        </table></div>
      ) : null}
      {loaded.length && colors ? (
        <div className="panel" style={{ marginTop: 14 }}><h2 className="h3">{t('Earnings growth, first profitable year = 100')}</h2>
          <ChartBox height={280} label={t('Earnings per share indexed to 100 in the first year, for each company')}>
            <Line data={{ labels: years, datasets: loaded.map(([c, d], i) => {
              const ys = d.summary.years; const base = ys.find((y) => (y.eps ?? 0) > 0)?.eps;
              return { label: c, borderColor: colors[LINE_COLORS[i]], backgroundColor: colors[LINE_COLORS[i]], pointRadius: 3, tension: 0.2, spanGaps: true,
                data: years.map((yr) => { const e = ys.find((y) => y.year === yr)?.eps; return base && e != null ? Math.round((e / base) * 1000) / 10 : null; }) };
            }) }} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, 1)}` } } } }} />
          </ChartBox>
          <p className="why">{t('Lines above 100 mean earnings per share grew since the first year shown. Companies of very different size become comparable this way.')}</p></div>
      ) : null}
    </>
  );
}

export default function ComparePage() {
  return <Suspense fallback={<Skeleton />}><Compare /></Suspense>;
}
