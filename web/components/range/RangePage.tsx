'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { useApi } from '@/components/AppProvider';
import { SortHeader } from '@/components/SortHeader';
import { compareNullsLast, fmt, signed, tone } from '@/components/format';
import { listTrades, useMode } from '@/components/portfolio-store';
import { useWatchlist } from '@/components/Watchlist';
import { MyRules } from '@/components/range/MyRules';
import { rangeStats, gainFromBuyPct, type RangeRow, type Owned } from '@/lib/range';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface CompaniesResponse { rows: CompanyRow[]; session: MarketSession | null }

interface TableRow {
  code: string;
  name: string;
  price: number | null;
  weekLow52: number | null;
  weekHigh52: number | null;
  aboveLowPct: number | null;
  belowHighPct: number | null;
  position: number | null;
  shares?: number;
  avgCost?: number;
  gainPct?: number | null;
}

const BASE_SORTS: [string, string][] = [
  ['aboveLow', 'Above low %'],
  ['belowHigh', 'Below high %'],
  ['code', 'Company'],
  ['price', 'Price'],
  ['weekLow52', '52-wk low'],
  ['weekHigh52', '52-wk high'],
];
const HOLDINGS_SORTS: [string, string][] = [
  ['avgCost', 'Your avg price'],
  ['gainPct', 'Your gain %'],
  ['shares', 'Shares'],
];
const ASCENDING_FIRST = new Set(['code']);

function sortKey(r: TableRow, k: string): number | string | null {
  if (k === 'aboveLow') return r.aboveLowPct;
  if (k === 'belowHigh') return r.belowHighPct;
  if (k === 'position') return r.position;
  if (k === 'code') return r.code;
  if (k === 'price') return r.price;
  if (k === 'weekLow52') return r.weekLow52;
  if (k === 'weekHigh52') return r.weekHigh52;
  if (k === 'avgCost') return r.avgCost ?? null;
  if (k === 'gainPct') return r.gainPct ?? null;
  if (k === 'shares') return r.shares ?? null;
  return null;
}

function PositionBar({ position }: { position: number }) {
  const pct = Math.round(position * 100);
  const left = Math.round(position * 44);
  return (
    <span
      aria-label={`${pct}% from the low`}
      style={{
        display: 'inline-block', width: '56px', height: '8px',
        background: 'var(--border)', borderRadius: '4px', position: 'relative', verticalAlign: 'middle',
      }}
    >
      <span style={{
        position: 'absolute', left: `${left}px`, top: '-2px',
        width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent)',
      }} />
    </span>
  );
}

export function RangePage() {
  const { t } = useLang();
  const { data, error } = useApi<CompaniesResponse>('/api/companies');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { codes: watchlistCodes } = useWatchlist();
  const { mode, ready } = useMode();
  const [holdings, setHoldings] = useState<Owned[]>([]);

  const view = params.get('view') === 'risen' ? 'risen' : 'low';
  const who = params.get('who') === 'holdings' ? 'holdings' : '';
  const within = Number(params.get('within') || '');
  const withinActive = Number.isFinite(within) && within > 0;

  const defaultSort = view === 'risen' ? { key: 'aboveLow', dir: -1 } : { key: 'aboveLow', dir: 1 };
  const sortDirParam = params.get('dir');
  const sortKeyParam = params.get('sort') || defaultSort.key;
  const sortDirVal = sortDirParam ? Number(sortDirParam) : defaultSort.dir;
  const sort = { key: sortKeyParam, dir: sortDirVal };

  useEffect(() => {
    if (!ready) return;
    let active = true;
    listTrades('real').then((l) => {
      if (!active) return;
      setHoldings(l.holdings.filter((h) => h.shares > 0).map((h) => ({ code: h.code, shares: h.shares, avgCost: h.avgCost })));
    }, () => setHoldings([]));
    return () => { active = false; };
  }, [ready, mode]);

  const rangeRows = useMemo<RangeRow[]>(() => (data?.rows ?? []).map((r) => ({
    code: r.code, price: r.price, weekLow52: r.weekLow52, weekHigh52: r.weekHigh52,
  })), [data]);

  const holdingsByCode = useMemo(() => new Map(holdings.map((h) => [h.code, h])), [holdings]);

  const rows = useMemo<TableRow[]>(() => {
    const source = data?.rows ?? [];
    const subset = who === 'holdings' ? source.filter((r) => holdingsByCode.has(r.code)) : source;
    return subset.map((r) => {
      const stats = rangeStats({ code: r.code, price: r.price, weekLow52: r.weekLow52, weekHigh52: r.weekHigh52 });
      const owned = holdingsByCode.get(r.code);
      return {
        code: r.code, name: r.name,
        price: r.price, weekLow52: r.weekLow52, weekHigh52: r.weekHigh52,
        aboveLowPct: stats?.aboveLowPct ?? null,
        belowHighPct: stats?.belowHighPct ?? null,
        position: stats?.position ?? null,
        ...(owned ? { shares: owned.shares, avgCost: owned.avgCost, gainPct: gainFromBuyPct(r.price, owned.avgCost) } : {}),
      };
    });
  }, [data, who, holdingsByCode]);

  const shown = useMemo(() => {
    let list = rows;
    if (withinActive) list = list.filter((r) => r.aboveLowPct != null && r.aboveLowPct <= within);
    return [...list].sort((a, b) => compareNullsLast(sortKey(a, sortKeyParam), sortKey(b, sortKeyParam), sortDirVal));
  }, [rows, sortKeyParam, sortDirVal, withinActive, within]);

  const setParams = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || (k === 'view' && v === 'low') || (k === 'who' && v === '') || (k === 'within' && v === '')) q.delete(k);
      else q.set(k, String(v));
    }
    router.replace(pathname + (q.toString() ? '?' + q : ''), { scroll: false });
  };

  const defaultDir = (k: string) => ASCENDING_FIRST.has(k) ? 1 : (k === 'aboveLow' ? (view === 'risen' ? -1 : 1) : -1);
  const onSort = (k: string) => setParams({ sort: k, dir: sort.key === k ? -sort.dir : defaultDir(k) });

  const allSorts = who === 'holdings' ? [...BASE_SORTS, ...HOLDINGS_SORTS] : BASE_SORTS;

  if (error && !data) return <div className="note bad"><Tr text="Could not load" />: {error}</div>;

  const holdingCount = holdings.length;
  const showHoldings = who === 'holdings';

  return (
    <>
      <h1><Tr text="52-week range" /></h1>
      <p className="small muted"><Tr text="A price near its low can fall further. Automatic figures and your own rules, not advice." /></p>

      <MyRules rows={rangeRows} watchlist={watchlistCodes} holdings={holdings} />

      <nav className="tabs" aria-label={t('Range views')}>
        <Link
          className="tab-link"
          aria-current={view === 'low' ? 'page' : undefined}
          href={pathname + (params.get('who') || params.get('within') ? '?' + new URLSearchParams({ ...(params.get('who') ? { who: params.get('who')! } : {}), ...(params.get('within') ? { within: params.get('within')! } : {}) }).toString() : '')}
        ><Tr text="Near the 52-week low" /></Link>
        <Link
          className="tab-link"
          aria-current={view === 'risen' ? 'page' : undefined}
          href={pathname + '?' + new URLSearchParams({ view: 'risen', ...(params.get('who') ? { who: params.get('who')! } : {}), ...(params.get('within') ? { within: params.get('within')! } : {}) }).toString()}
        ><Tr text="Risen from the low" /></Link>
      </nav>

      <div className="panel filter-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <div role="group" aria-label={t('Who to show')}>
          <button type="button" className={`btn${who === '' ? ' primary' : ''}`}
            aria-pressed={who === ''}
            onClick={() => setParams({ who: '' })}>
            <Tr text="All companies" />
          </button>
          <button type="button" className={`btn${who === 'holdings' ? ' primary' : ''}`}
            aria-pressed={who === 'holdings'}
            onClick={() => setParams({ who: 'holdings' })}>
            <Tr text="My holdings" />
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <Tr text="Within" />
          <input
            type="number" min={0.5} max={100} step={0.5}
            value={withinActive ? within : ''}
            aria-label={t('Within % of the low')}
            style={{ width: '70px' }}
            placeholder="—"
            onChange={(e) => setParams({ within: e.target.value || '' })} />
          <Tr text="% of the low" />
        </label>
        {withinActive && (
          <button type="button" className="btn ghost" onClick={() => setParams({ within: '' })}>
            <Tr text="Clear filters" />
          </button>
        )}
      </div>

      <div className="filters card-sort">
        <select aria-label={t('Sort by')} value={sort.key} onChange={(e) => setParams({ sort: e.target.value, dir: defaultDir(e.target.value) })}>
          {allSorts.map(([k, l]) => <option key={k} value={k}>{t('Sort by')}: {t(l)}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => setParams({ dir: -sort.dir })}>
          {sort.dir > 0 ? t('Low to high') : t('High to low')}
        </button>
      </div>

      <div className="panel table-wrap">
        <table className="cards">
          <thead><tr>
            <SortHeader k="code" label="Company" sort={sort} onSort={onSort} />
            <SortHeader k="price" label="Price" sort={sort} onSort={onSort} numeric />
            <SortHeader k="weekLow52" label="52-wk low" sort={sort} onSort={onSort} numeric />
            <SortHeader k="weekHigh52" label="52-wk high" sort={sort} onSort={onSort} numeric />
            <SortHeader k="aboveLow" label="Above low %" sort={sort} onSort={onSort} numeric />
            <SortHeader k="belowHigh" label="Below high %" sort={sort} onSort={onSort} numeric />
            <th aria-label={t('Position in range')}><Tr text="Position" /></th>
            {showHoldings && <>
              <SortHeader k="avgCost" label="Your avg price" sort={sort} onSort={onSort} numeric />
              <SortHeader k="gainPct" label="Your gain %" sort={sort} onSort={onSort} numeric />
              <SortHeader k="shares" label="Shares" sort={sort} onSort={onSort} numeric />
            </>}
          </tr></thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={showHoldings ? 10 : 7} className="empty">{t('Loading…')}</td></tr>
            ) : showHoldings && holdingCount === 0 ? (
              <tr><td colSpan={10} className="empty">
                <Tr text="No holdings yet. Add trades on" />{' '}
                <Link href="/portfolio"><Tr text="Portfolio" /></Link>.
              </td></tr>
            ) : shown.length ? shown.map((r) => (
              <tr key={r.code} onClick={() => router.push('/c/' + encodeURIComponent(r.code))}>
                <td>
                  <b className="mono"><a href={'/c/' + encodeURIComponent(r.code)} onClick={(e) => e.stopPropagation()}>{r.code}</a></b>
                  <div className="small muted">{r.name}</div>
                </td>
                <td className="n mono" data-label={t('Price')}>{r.price != null ? `৳${fmt(r.price)}` : '—'}</td>
                <td className="n mono" data-label={t('52-wk low')}>{r.weekLow52 != null ? `৳${fmt(r.weekLow52)}` : '—'}</td>
                <td className="n mono" data-label={t('52-wk high')}>{r.weekHigh52 != null ? `৳${fmt(r.weekHigh52)}` : '—'}</td>
                <td className={`n mono ${tone(r.aboveLowPct)}`} data-label={t('Above low %')}>
                  {r.aboveLowPct != null ? `${r.aboveLowPct > 0 ? '+' : ''}${fmt(r.aboveLowPct, 1)}%` : '—'}
                </td>
                <td className="n mono" data-label={t('Below high %')}>
                  {r.belowHighPct != null ? `${fmt(r.belowHighPct, 1)}%` : '—'}
                </td>
                <td data-label={t('Position in range')}>
                  {r.position != null ? <PositionBar position={r.position} /> : '—'}
                </td>
                {showHoldings && <>
                  <td className="n mono" data-label={t('Your avg price')}>{r.avgCost != null ? `৳${fmt(r.avgCost)}` : '—'}</td>
                  <td className={`n mono ${tone(r.gainPct)}`} data-label={t('Your gain %')}>{signed(r.gainPct)}</td>
                  <td className="n mono" data-label={t('Shares')}>{r.shares != null ? r.shares.toLocaleString() : '—'}</td>
                </>}
              </tr>
            )) : (
              <tr><td colSpan={showHoldings ? 10 : 7} className="empty"><Tr text="No company has figures in this filter." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
