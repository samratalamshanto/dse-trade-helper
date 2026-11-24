'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { CompanyTabs } from '@/components/CompanyTabs';
import { useMemo, useState } from 'react';
import { FilterBox, matchesText } from '@/components/FilterBox';
import { useApi } from '@/components/AppProvider';
import { fmt, sectorName, signed, tone } from '@/components/format';
import { useLang } from '@/components/i18n';
import { Info, SIGNALS, Skeleton, type Signal } from '@/components/ui';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface Companies { rows: CompanyRow[]; medians: Record<string, number | null>; session: MarketSession | null }
const KEYS = Object.keys(SIGNALS) as Signal[];
const TOP = 3;

export default function SectorsPage() {
  const { t } = useLang();
  const { data, error } = useApi<Companies>('/api/companies');
  const [q, setQ] = useState('');
  const sectors = useMemo(() => {
    const groups: Record<string, CompanyRow[]> = {};
    for (const r of data?.rows || []) (groups[r.sector] ||= []).push(r);
    return Object.entries(groups).map(([sector, rows]) => {
      const moves = rows.map((r) => r.changePct).filter((x): x is number => x != null && Number.isFinite(x));
      return {
        sector, rows, medianPe: data?.medians[sector] ?? null,
        avgMove: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null,
        counts: Object.fromEntries(KEYS.map((k) => [k, rows.filter((r) => r.signal === k).length])) as Record<Signal, number>,
        top: [...rows].filter((r) => r.signal !== 'avoid').sort((a, b) => b.score - a.score).slice(0, TOP),
      };
    }).sort((a, b) => b.rows.length - a.rows.length);
  }, [data]);

  // Title and tabs stay on screen while the data loads, so a tab change does not look like a page reload.
  const head = <><h1><Tr text="Sectors" /></h1><CompanyTabs /></>;
  if (error && !data) return <>{head}<div className="note bad">Could not load sectors: {error}</div></>;
  if (!data) return <>{head}<Skeleton label="Loading sectors" rows={8} /></>;
  // A sector shows when its name matches, or when one of its companies does (that company is then named on the card).
  const shown = sectors.map((s) => ({ ...s, found: matchesText(q, sectorName(s.sector)) ? [] : s.rows.filter((r) => matchesText(q, r.code, r.name)) }))
    .filter((s) => !q.trim() || matchesText(q, sectorName(s.sector)) || s.found.length);
  return (
    <>
      {head}
      <p className="muted">Compare a company with others in the same industry. A bank&apos;s P/E is not comparable with a pharma company&apos;s P/E. <Info text="Median P/E counts only profitable companies outside category Z." /></p>
      <div className="page-toolbar">
        <FilterBox value={q} onChange={setQ} label="Find a sector or company" />
        <span className="small muted" aria-live="polite">{t('Showing {n} sectors').replace('{n}', String(shown.length))}</span>
      </div>
      {shown.length ? null : <div className="empty"><Tr text="No sector or company matches the search." /></div>}
      <div className="grid g3">{shown.map((s) => (
        <section key={s.sector} className="panel sector-card" aria-label={sectorName(s.sector)}>
          <div className="sector-head"><h2 className="h3">{sectorName(s.sector)}</h2><span className="small muted">{s.rows.length} companies</span></div>
          {s.found.length ? <p className="small"><Tr text="Has" />: {s.found.slice(0, TOP).map((r, i) => <span key={r.code}>{i ? ', ' : ''}<Link href={'/c/' + encodeURIComponent(r.code)} className="mono">{r.code}</Link></span>)}</p> : null}
          <div className="grid g2 sector-stats">
            <div><div className="small muted"><Tr text="Median P/E" /></div><div className="mono stat">{fmt(s.medianPe, 1)}</div></div>
            <div><div className="small muted"><Tr text="Average move" /></div><div className={`mono stat ${tone(s.avgMove)}`}>{signed(s.avgMove, 2)}</div></div>
          </div>
          <div className="signal-split" role="img" aria-label={KEYS.map((k) => `${t(SIGNALS[k].label)} ${s.counts[k]}`).join(', ')}>
            {KEYS.map((k) => (s.counts[k] ? <i key={k} className={`seg-${k}`} style={{ flexGrow: s.counts[k] }} /> : null))}
          </div>
          <div className="small muted signal-legend">{KEYS.filter((k) => s.counts[k]).map((k, i) => <span key={k}>{i ? ' · ' : ''}<i className={`seg-${k}`} aria-hidden="true" />{s.counts[k]} {t(SIGNALS[k].label).toLowerCase()}</span>)}</div>
          {s.top.length ? <><div className="small muted" style={{ marginTop: 10 }}><Tr text="Highest scores" /></div>
            <ol className="sector-top">{s.top.map((r) => <li key={r.code}><Link href={'/c/' + encodeURIComponent(r.code)} className="mono">{r.code}</Link><span className="mono small muted">{r.score}</span></li>)}</ol></> : null}
          <Link className="small" href={'/all?sector=' + encodeURIComponent(s.sector)}>All {s.rows.length} companies →</Link>
        </section>
      ))}</div>
    </>
  );
}
