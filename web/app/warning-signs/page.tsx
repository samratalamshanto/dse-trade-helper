'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useApi } from '@/components/AppProvider';
import { fmt, sectorName, signed } from '@/components/format';
import { FraudPill, Skeleton, type FraudLevel } from '@/components/ui';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

function WarningSigns() {
  const { data, error } = useApi<{ rows: CompanyRow[]; session: MarketSession | null }>('/api/companies');
  const lane = useSearchParams().get('lane') === 'z' ? 'z' : 'warn';
  const router = useRouter();
  if (error && !data) return <div className="note bad">Could not load the list: {error}</div>;
  const rows = data?.rows ?? [];
  const warn = rows.filter((r) => r.fraud !== 'clean' && r.category !== 'Z').sort((a, b) => b.flags.length - a.flags.length || (b.change1y ?? 0) - (a.change1y ?? 0));
  const z = rows.filter((r) => r.category === 'Z').sort((a, b) => (b.change1y ?? -Infinity) - (a.change1y ?? -Infinity));
  const list = lane === 'z' ? z : warn;

  return (
    <>
      <h1><Tr text="Warning signs" /></h1>
      <div className="note warn"><Tr text="A flag is a pattern in public data that needs a closer look, not proof of wrongdoing. Read the company's DSE disclosures and latest results before you trade a flagged share." /></div>
      <nav className="tabs" aria-label="Warning sign lists">
        <Link className="tab-link" aria-current={lane === 'warn' ? 'page' : undefined} href="/warning-signs"><Tr text="Warnings" /> ({warn.length})</Link>
        <Link className="tab-link" aria-current={lane === 'z' ? 'page' : undefined} href="/warning-signs?lane=z"><Tr text="Category Z" /> ({z.length})</Link>
      </nav>
      <p className="muted small">{lane === 'z'
        ? <Tr text="Category Z companies missed AGMs, paid no dividend or stopped operating. Sorted by 1-year price change: a fast rise in a Z share is a pattern to investigate." />
        : <Tr text="Sorted by number of flags, then by 1-year price change." />} <Tr text="The 1-year change is grey on purpose: fast rises are a pattern to investigate here, not good news." /></p>
      <div className="panel table-wrap"><table className="cards">
        <thead><tr><th>Company</th><th><Tr text="Warning-sign check" /></th><th><Tr text="Flags" /></th><th className="n">Price</th><th className="n">1 year</th></tr></thead>
        <tbody>{!data ? <tr><td colSpan={5} className="empty">Loading…</td></tr> : list.length ? list.map((r) => (
          <tr key={r.code} onClick={() => router.push('/c/' + encodeURIComponent(r.code))}>
            <td><b className="mono">{r.code}</b><div className="small muted">{r.name} · {sectorName(r.sector)}</div></td>
            <td data-label="Warning-sign check"><FraudPill level={r.fraud as FraudLevel} href={'/c/' + encodeURIComponent(r.code) + '#safety'} flags={r.flags} /></td>
            <td className="small" data-label="Flags">{r.flags.join(' · ') || '—'}</td>
            <td className="n mono" data-label="Price">৳{fmt(r.price)}</td><td className="n mono muted" data-label="1 year">{signed(r.change1y)}</td>
          </tr>
        )) : <tr><td colSpan={5} className="empty"><Tr text="No companies in this list right now." /></td></tr>}</tbody>
      </table></div>
    </>
  );
}

export default function WarningSignsPage() {
  return <Suspense fallback={<Skeleton />}><WarningSigns /></Suspense>;
}
