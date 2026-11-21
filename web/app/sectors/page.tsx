'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { CompanyTabs } from '@/components/CompanyTabs';
import { useMemo } from 'react';
import { useApi } from '@/components/AppProvider';
import { fmt, sectorName, signed, tone } from '@/components/format';
import { useLang } from '@/components/i18n';
import { Info, SIGNALS, type Signal } from '@/components/ui';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface Companies { rows: CompanyRow[]; medians: Record<string, number | null>; session: MarketSession | null }
const KEYS = Object.keys(SIGNALS) as Signal[];
const TOP = 3;

export default function SectorsPage() {
  const { t } = useLang();
  const { data, error } = useApi<Companies>('/api/companies');
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

  if (error && !data) return <div className="note bad">Could not load sectors: {error}</div>;
  if (!data) return <div className="empty">Loading…</div>;
  return (
    <>
      <h1><Tr text="Sectors" /></h1>
      <CompanyTabs />
      <p className="muted">Compare a company with others in the same industry. A bank&apos;s P/E is not comparable with a pharma company&apos;s P/E. <Info text="Median P/E counts only profitable companies outside category Z." /></p>
      <div className="grid g3">{sectors.map((s) => (
        <section key={s.sector} className="panel sector-card" aria-label={sectorName(s.sector)}>
          <div className="sector-head"><h2 className="h3">{sectorName(s.sector)}</h2><span className="small muted">{s.rows.length} companies</span></div>
          <div className="grid g2 sector-stats">
            <div><div className="small muted"><Tr text="Median P/E" /></div><div className="mono stat">{fmt(s.medianPe, 1)}</div></div>
            <div><div className="small muted"><Tr text="Average move" /></div><div className={`mono stat ${tone(s.avgMove)}`}>{signed(s.avgMove, 2)}</div></div>
          </div>
          <div className="signal-split" role="img" aria-label={KEYS.map((k) => `${t(SIGNALS[k].label)} ${s.counts[k]}`).join(', ')}>
            {KEYS.map((k) => (s.counts[k] ? <i key={k} className={`seg-${k}`} style={{ flexGrow: s.counts[k] }} /> : null))}
          </div>
          <div className="small muted">{KEYS.filter((k) => s.counts[k]).map((k) => `${s.counts[k]} ${t(SIGNALS[k].label).toLowerCase()}`).join(' · ')}</div>
          {s.top.length ? <><div className="small muted" style={{ marginTop: 10 }}><Tr text="Highest scores" /></div>
            <ol className="sector-top">{s.top.map((r) => <li key={r.code}><Link href={'/c/' + encodeURIComponent(r.code)} className="mono">{r.code}</Link><span className="mono small">{r.score}</span></li>)}</ol></> : null}
          <Link className="small" href={'/all?sector=' + encodeURIComponent(s.sector)}>All {s.rows.length} companies →</Link>
        </section>
      ))}</div>
    </>
  );
}
