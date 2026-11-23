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
import { QuickPickChips } from '@/components/QuickPickChips';
import { pickTest, QUICK_PICK_KEYS, type QuickPickKey } from '@/lib/quick-picks';
import { rangeStats, rangeLooksWrong, gainFromBuyPct, type RangeRow, type Owned } from '@/lib/range';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface CompaniesResponse { rows: CompanyRow[]; medians?: Record<string, number | null>; session: MarketSession | null }

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
      role="img"
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
  const { data: apiData, error } = useApi<CompaniesResponse>('/api/companies');
  // The company list may already be cached in the browser (the top bar loads it); the server never has it.
  // Until mounted, render the same "Loading…" the server rendered, so hydration always matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { void Promise.resolve().then(() => setMounted(true)); }, []);
  const data = mounted ? apiData : undefined;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { codes: watchlistCodes } = useWatchlist();
  const { mode, ready } = useMode();
  const [holdings, setHoldings] = useState<Owned[]>([]);
  // null until the first answer, so "No holdings yet" never flashes while they load, and a failure says so.
  const [holdingsState, setHoldingsState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const view = params.get('view') === 'risen' ? 'risen' : 'low';
  const whoParam = params.get('who');
  const who = whoParam === 'holdings' || whoParam === 'watchlist' ? whoParam : '';
  const pickParam = params.get('pick');
  const pick = QUICK_PICK_KEYS.includes(pickParam as QuickPickKey) ? pickParam as QuickPickKey : null;
  const within = Number(params.get('within') || '');
  const withinActive = Number.isFinite(within) && within > 0;

  const defaultSort = view === 'risen' ? { key: 'aboveLow', dir: -1 } : { key: 'aboveLow', dir: 1 };
  const sortDirParam = params.get('dir');
  const sortKeyParam = params.get('sort') || defaultSort.key;
  // Only 1 and -1 are directions; anything else in the address falls back to the tab's default.
  const sortDirVal = sortDirParam === '1' ? 1 : sortDirParam === '-1' ? -1 : defaultSort.dir;
  const sort = { key: sortKeyParam, dir: sortDirVal };

  useEffect(() => {
    if (!ready) return;
    let active = true;
    listTrades('real').then((l) => {
      if (!active) return;
      setHoldings(l.holdings.filter((h) => h.shares > 0).map((h) => ({ code: h.code, shares: h.shares, avgCost: h.avgCost })));
      setHoldingsState('ready');
    }, (e: unknown) => { if (!active) return; console.warn('range: could not load your holdings', e); setHoldings([]); setHoldingsState('failed'); });
    return () => { active = false; };
  }, [ready, mode]);

  const rangeRows = useMemo<RangeRow[]>(() => (data?.rows ?? []).map((r) => ({
    code: r.code, price: r.price, weekLow52: r.weekLow52, weekHigh52: r.weekHigh52,
  })), [data]);

  const holdingsByCode = useMemo(() => new Map(holdings.map((h) => [h.code, h])), [holdings]);

  const rows = useMemo<TableRow[]>(() => {
    const source = data?.rows ?? [];
    const watched = new Set(watchlistCodes);
    const subset = who === 'holdings' ? source.filter((r) => holdingsByCode.has(r.code)) : who === 'watchlist' ? source.filter((r) => watched.has(r.code)) : source;
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
  }, [data, who, holdingsByCode, watchlistCodes]);

  const shown = useMemo(() => {
    let list = rows;
    if (pick) {
      const all = data?.rows ?? [];
      const test = pickTest(pick, all, data?.medians);
      const passes = new Set(all.filter(test).map((c) => c.code));
      list = list.filter((r) => passes.has(r.code));
    }
    if (withinActive) list = list.filter((r) => r.aboveLowPct != null && r.aboveLowPct <= within);
    return [...list].sort((a, b) => compareNullsLast(sortKey(a, sortKeyParam), sortKey(b, sortKeyParam), sortDirVal));
  }, [rows, data, pick, sortKeyParam, sortDirVal, withinActive, within]);

  // A tab keeps who, pick and within; the sort resets to the tab's own default.
  const tabHref = (v: 'low' | 'risen') => {
    const q = new URLSearchParams(params.toString());
    q.delete('sort'); q.delete('dir');
    if (v === 'risen') q.set('view', 'risen'); else q.delete('view');
    const qs = q.toString();
    return pathname + (qs ? '?' + qs : '');
  };

  const setParams = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || (k === 'view' && v === 'low') || (k === 'who' && v === '') || (k === 'within' && v === '') || (k === 'pick' && v === '')) q.delete(k);
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

      <MyRules rows={rangeRows} companies={data?.rows ?? []} medians={data?.medians} watchlist={watchlistCodes} holdings={holdings} />

      <nav className="tabs" aria-label={t('Range views')}>
        <Link
          className="tab-link"
          aria-current={view === 'low' ? 'page' : undefined}
          href={tabHref('low')}
        ><Tr text="Near the 52-week low" /></Link>
        <Link
          className="tab-link"
          aria-current={view === 'risen' ? 'page' : undefined}
          href={tabHref('risen')}
        ><Tr text="Risen from the low" /></Link>
      </nav>

      <div className="panel filter-panel">
        <QuickPickChips active={pick} onPick={(p) => setParams({ pick: p ? p.key : '' })} />
      </div>

      <div className="panel filter-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <div role="group" aria-label={t('Who to show')}>
          <button type="button" className={`btn${who === '' ? ' primary' : ''}`}
            aria-pressed={who === ''}
            onClick={() => setParams({ who: '' })}>
            <Tr text="All companies" />
          </button>
          <button type="button" className={`btn${who === 'watchlist' ? ' primary' : ''}`}
            aria-pressed={who === 'watchlist'}
            onClick={() => setParams({ who: 'watchlist' })}>
            <Tr text="My watchlist" />
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
        <select aria-label={t('Sort by')} value={allSorts.some(([k]) => k === sort.key) ? sort.key : defaultSort.key} onChange={(e) => setParams({ sort: e.target.value, dir: defaultDir(e.target.value) })}>
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
            ) : showHoldings && holdingsState !== 'ready' ? (
              <tr><td colSpan={10} className="empty">{holdingsState === 'failed' ? t('Could not load your holdings. Try again in a minute.') : t('Loading…')}</td></tr>
            ) : who === 'watchlist' && watchlistCodes.length === 0 ? (
              <tr><td colSpan={7} className="empty">
                <Tr text="Your watchlist is empty." />{' '}<Link href="/all"><Tr text="Browse companies" /></Link>.
              </td></tr>
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
                  {rangeLooksWrong(r) ? <div className="small t-warn"><Tr text="Data looks wrong: the price is far outside its 52-week range." /></div> : null}
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
