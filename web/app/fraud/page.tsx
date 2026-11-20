'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useApi } from '@/components/AppProvider';
import { fmt, sectorName, signed } from '@/components/format';
import { FraudPill, type FraudLevel } from '@/components/ui';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

function FraudAlerts() {
  const { data, error } = useApi<{ rows: CompanyRow[]; session: MarketSession | null }>('/api/companies');
  const lane = useSearchParams().get('lane') === 'z' ? 'z' : 'warn';
  const router = useRouter();
  if (error && !data) return <div className="note bad">Could not load the alerts: {error}</div>;
  const rows = data?.rows ?? [];
  const warn = rows.filter((r) => r.fraud !== 'clean' && r.category !== 'Z').sort((a, b) => b.flags.length - a.flags.length || (b.change1y ?? 0) - (a.change1y ?? 0));
  const z = rows.filter((r) => r.category === 'Z').sort((a, b) => (b.change1y ?? -Infinity) - (a.change1y ?? -Infinity));
  const list = lane === 'z' ? z : warn;

  return (
    <>
      <h1><Tr text="Fraud alerts" /></h1>
      <div className="note warn">A flag shows a pattern that often comes with manipulation, such as a price pump or owners selling. It is <b>not proof</b> of fraud.
        Before you buy a flagged share, read its DSE disclosures and the latest results.</div>
      <nav className="tabs" aria-label="Alert lists">
        <Link className="tab-link" aria-current={lane === 'warn' ? 'page' : undefined} href="/fraud">Warnings outside category Z ({warn.length})</Link>
        <Link className="tab-link" aria-current={lane === 'z' ? 'page' : undefined} href="/fraud?lane=z">Category Z ({z.length})</Link>
      </nav>
      <p className="muted small">{lane === 'z'
        ? 'Category Z companies missed AGMs, paid no dividend or stopped operating. Sorted by 1-year price change: a big rise in a Z share is the classic manipulation pattern.'
        : 'Sorted by number of flags, then by 1-year price change.'} The 1-year change is grey on purpose: fast rises are a warning sign here, not good news.</p>
      <div className="panel table-wrap"><table className="cards">
        <thead><tr><th>Company</th><th>Fraud check</th><th>Flags</th><th className="n">Price</th><th className="n">1 year</th></tr></thead>
        <tbody>{!data ? <tr><td colSpan={5} className="empty">Loading…</td></tr> : list.length ? list.map((r) => (
          <tr key={r.code} onClick={() => router.push('/c/' + encodeURIComponent(r.code))}>
            <td><b className="mono">{r.code}</b><div className="small muted">{r.name} · {sectorName(r.sector)}</div></td>
            <td data-label="Fraud check"><FraudPill level={r.fraud as FraudLevel} /></td>
            <td className="small" data-label="Flags">{r.flags.join(' · ') || '—'}</td>
            <td className="n mono" data-label="Price">৳{fmt(r.price)}</td><td className="n mono muted" data-label="1 year">{signed(r.change1y)}</td>
          </tr>
        )) : <tr><td colSpan={5} className="empty">None.</td></tr>}</tbody>
      </table></div>
    </>
  );
}

export default function FraudPage() {
  return <Suspense fallback={<div className="empty">Loading…</div>}><FraudAlerts /></Suspense>;
}
