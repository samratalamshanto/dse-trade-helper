'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useApp } from '@/components/AppProvider';
import { fmt, marketState, sectorName, signed, tone } from '@/components/format';
import type { CompanyRow } from '@/lib/service';

// Before the first trade DSE reports no change; say so instead of showing a fake 0.00%.
export function ChangeText({ pct, suffix = '' }: { pct: number | null | undefined; suffix?: string }) {
  const { session } = useApp();
  if (marketState(session).key !== 'open' && !pct) return <span className="muted"><Tr text="no trade yet today" /></span>;
  return <span className={tone(pct)}>{signed(pct, 2)}{suffix}</span>;
}

export function CompanyCard({ r }: { r: CompanyRow }) {
  return (
    <Link className="panel card" href={'/c/' + encodeURIComponent(r.code)}>
      <div className="top">
        <div><b className="mono">{r.code}</b><div className="small muted">{r.name}</div></div>
        <div style={{ textAlign: 'right' }}><div className="score mono">{r.score}</div><div className="small muted">score</div></div>
      </div>
      <div className="bar"><i style={{ width: `${r.score}%` }} /></div>
      <div className="small">{sectorName(r.sector)} · ৳{fmt(r.price)} <ChangeText pct={r.changePct} /></div>
      <div className="small muted">P/E {fmt(r.pe, 1)} · Dividend yield {fmt(r.dividendYield, 1)}% · EPS growth {signed(r.epsCagr)}/yr</div>
    </Link>
  );
}
