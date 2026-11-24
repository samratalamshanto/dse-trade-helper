'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useApi } from '@/components/AppProvider';
import { compareNullsLast, fmt, sectorName, signed } from '@/components/format';
import { SortHeader } from '@/components/SortHeader';
import { FraudPill, Icon, Skeleton, type FraudLevel } from '@/components/ui';
import { useLang } from '@/components/i18n';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import { CompanySearch } from '@/components/CompanySearch';

function WarningSigns() {
  const { t } = useLang();
  const { data, error } = useApi<{ rows: CompanyRow[]; session: MarketSession | null }>('/api/companies');
  const params = useSearchParams();
  const lane = params.get('lane') === 'z' ? 'z' : 'warn';
  const router = useRouter();
  const pathname = usePathname();
  const codeFilter = params.get('code') || '';
  const [companyQ, setCompanyQ] = useState(codeFilter);
  // Follow the address when it changes (back button, Show all), without an effect.
  const [syncedCode, setSyncedCode] = useState(codeFilter);
  if (syncedCode !== codeFilter) { setSyncedCode(codeFilter); setCompanyQ(codeFilter); }
  const rows = data?.rows ?? [];
  const searchData = useMemo(() => {
    const r = data?.rows ?? [];
    if (lane === 'z') return r.filter((row) => row.category === 'Z').map((row) => ({ code: row.code, name: row.name }));
    return r.filter((row) => row.fraud !== 'clean' && row.category !== 'Z').map((row) => ({ code: row.code, name: row.name }));
  }, [data, lane]);

  const setParams = (patch: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === '') q.delete(k); else q.set(k, v); }
    router.replace(pathname + (q.toString() ? '?' + q : ''), { scroll: false });
  };

  if (error && !data) return <div className="note bad">Could not load the list: {error}</div>;
  const warn = rows.filter((r) => r.fraud !== 'clean' && r.category !== 'Z');
  const z = rows.filter((r) => r.category === 'Z');
  const baseList = lane === 'z' ? z : warn;
  // Default: flags, then 1-year change (the Z tab: 1-year change). Ties fall back to the 1-year change.
  const sort = { key: params.get('sort') || (lane === 'z' ? 'change1y' : 'flags'), dir: params.get('dir') === '1' ? 1 : -1 };
  const key = (r: CompanyRow): unknown => (sort.key === 'flags' ? r.flags.length : sort.key === 'code' ? r.code : sort.key === 'price' ? r.price : r.change1y);
  const onSort = (k: string) => setParams({ sort: k, dir: sort.key === k ? String(-sort.dir) : k === 'code' ? '1' : '-1' });
  const list = (codeFilter ? baseList.filter((r) => r.code === codeFilter) : baseList)
    .sort((a, b) => compareNullsLast(key(a), key(b), sort.dir) || (b.change1y ?? -Infinity) - (a.change1y ?? -Infinity));

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
      {lane === 'warn' && <p className="small"><span className="t-bad"><Tr text="Red" /></span>: <Tr text="a fast price rise or loss-making rise backed by a flag of another kind." /> <span className="t-warn"><Tr text="Amber" /></span>: <Tr text="patterns to check, not backed by a second kind of flag." /></p>}
      <div className="picker-row">
        <CompanySearch
          companies={searchData}
          value={companyQ}
          onChange={(q) => { setCompanyQ(q); if (codeFilter) setParams({ code: '' }); }}
          onPick={(code) => { setCompanyQ(code); setParams({ code }); }}
          label={t('Pick a company')}
          placeholder={t('Pick a company')}
        />
        {codeFilter && (
          <button type="button" className="btn ghost" onClick={() => { setCompanyQ(''); setParams({ code: '' }); }}>
            <Icon name="cross" />{t('Show all')}
          </button>
        )}
      </div>
      <div className="panel table-wrap"><table className="cards">
        <thead><tr>
          <SortHeader k="code" label="Company" sort={sort} onSort={onSort} /><SortHeader k="flags" label="Warning-sign check" sort={sort} onSort={onSort} /><th><Tr text="Flags" /></th>
          <SortHeader k="price" label="Price" sort={sort} onSort={onSort} numeric /><SortHeader k="change1y" label="1 year" sort={sort} onSort={onSort} numeric />
        </tr></thead>
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
