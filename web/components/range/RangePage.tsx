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
import { QuickPickChips } from '@/components/QuickPickChips';
import { PositionBar } from '@/components/PositionBar';
import { parsePickList, picksTest } from '@/lib/quick-picks';
import { rangeStats, rangeLooksWrong, gainFromBuyPct, type Owned } from '@/lib/range';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import { CompanySearch } from '@/components/CompanySearch';
import { rangePct } from '@/lib/dividend-checks';
import { Icon } from '@/components/ui';

interface CompaniesResponse { rows: CompanyRow[]; medians?: Record<string, number | null>; session: MarketSession | null }

interface TableRow {
  code: string;
  name: string;
  price: number | null;
  weekLow52: number | null;
  weekHigh52: number | null;
  aboveLowPct: number | null;
  position: number | null;
  score: number | null;
  shares?: number;
  avgCost?: number;
  gainPct?: number | null;
}

const BASE_SORTS: [string, string][] = [
  ['position', 'Position'],
  ['code', 'Company'],
  ['price', 'Price'],
  ['range', '52-week range'],
  ['score', 'Score'],
];
// Old links used one sort per column; each old column now lives in the Position or Range cell.
const OLD_SORTS: Record<string, string> = { aboveLow: 'position', belowHigh: 'position', weekLow52: 'range', weekHigh52: 'range' };
const HOLDINGS_SORTS: [string, string][] = [
  ['avgCost', 'Your avg price'],
  ['gainPct', 'Your gain %'],
  ['shares', 'Shares'],
];
const ASCENDING_FIRST = new Set(['code']);

function sortKey(r: TableRow, k: string): number | string | null {
  if (k === 'position') return r.position;
  if (k === 'code') return r.code;
  if (k === 'price') return r.price;
  if (k === 'range') return r.weekLow52;
  if (k === 'score') return r.score;
  if (k === 'avgCost') return r.avgCost ?? null;
  if (k === 'gainPct') return r.gainPct ?? null;
  if (k === 'shares') return r.shares ?? null;
  return null;
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
  // ?pick=good,dividend: every chosen pick must pass. The old one-value form (?pick=good) reads the same way.
  const pickParam = params.get('pick');
  const picks = useMemo(() => parsePickList(pickParam), [pickParam]);
  const within = Number(params.get('within') || '');
  const withinActive = Number.isFinite(within) && within > 0;
  // ?minScore=70: keep companies whose rule score (0-100, as on Companies) is at least this.
  const minScore = Number(params.get('minScore') || '');
  const minScoreActive = Number.isFinite(minScore) && minScore > 0;
  const codeFilter = params.get('code') || '';
  const [companyQ, setCompanyQ] = useState(codeFilter);
  // Follow the address when it changes (back button, Show all), without an effect.
  const [syncedCode, setSyncedCode] = useState(codeFilter);
  if (syncedCode !== codeFilter) { setSyncedCode(codeFilter); setCompanyQ(codeFilter); }

  const defaultSort = view === 'risen' ? { key: 'position', dir: -1 } : { key: 'position', dir: 1 };
  const sortDirParam = params.get('dir');
  const rawSort = params.get('sort') || defaultSort.key;
  const sortKeyParam = Object.hasOwn(OLD_SORTS, rawSort) ? OLD_SORTS[rawSort] : rawSort;
  // Only 1 and -1 are directions; anything else in the address falls back to the tab's default.
  const urlDir = sortDirParam === '1' ? 1 : sortDirParam === '-1' ? -1 : null;
  // Old belowHigh ran the other way round from position (ascending = near the high).
  const sortDirVal = urlDir == null ? defaultSort.dir : rawSort === 'belowHigh' ? -urlDir : urlDir;
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
        position: stats?.position ?? null,
        // An unrated company (no EPS published) has no score, as on the company and compare pages.
        score: !r.notRated && Number.isFinite(r.score) ? r.score : null,
        ...(owned ? { shares: owned.shares, avgCost: owned.avgCost, gainPct: gainFromBuyPct(r.price, owned.avgCost) } : {}),
      };
    });
  }, [data, who, holdingsByCode, watchlistCodes]);

  const searchData = useMemo(() => (data?.rows ?? []).map((r) => ({ code: r.code, name: r.name })), [data]);

  const shown = useMemo(() => {
    let list = rows;
    if (picks.length) {
      const all = data?.rows ?? [];
      const test = picksTest(picks, all, data?.medians);
      const passes = new Set(all.filter(test).map((c) => c.code));
      list = list.filter((r) => passes.has(r.code));
    }
    if (withinActive) list = list.filter((r) => r.aboveLowPct != null && r.aboveLowPct <= within);
    if (minScoreActive) list = list.filter((r) => r.score != null && r.score >= minScore);
    if (codeFilter) list = list.filter((r) => r.code === codeFilter);
    return [...list].sort((a, b) => compareNullsLast(sortKey(a, sortKeyParam), sortKey(b, sortKeyParam), sortDirVal));
  }, [rows, data, picks, sortKeyParam, sortDirVal, withinActive, within, minScoreActive, minScore, codeFilter]);

  // A tab keeps who, pick, within and minScore; the sort resets to the tab's own default.
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
      if (v === '' || (k === 'view' && v === 'low') || (k === 'who' && v === '') || (k === 'within' && v === '') || (k === 'minScore' && v === '') || (k === 'pick' && v === '') || (k === 'code' && v === '')) q.delete(k);
      else q.set(k, String(v));
    }
    router.replace(pathname + (q.toString() ? '?' + q : ''), { scroll: false });
  };

  const defaultDir = (k: string) => ASCENDING_FIRST.has(k) ? 1 : (k === 'position' ? (view === 'risen' ? -1 : 1) : -1);
  const onSort = (k: string) => setParams({ sort: k, dir: sort.key === k ? -sort.dir : defaultDir(k) });

  const allSorts = who === 'holdings' ? [...BASE_SORTS, ...HOLDINGS_SORTS] : BASE_SORTS;

  if (error && !data) return <div className="note bad"><Tr text="Could not load" />: {error}</div>;

  const holdingCount = holdings.length;
  const showHoldings = who === 'holdings';

  return (
    <>
      <h1><Tr text="52-week range" /></h1>
      <p className="small muted"><Tr text="A price near its low can fall further. Automatic figures and your own rules, not advice." /></p>


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
        <p className="small muted"><Tr text="Tap more than one to combine them: a company must pass all of them." /></p>
        <p className="small muted"><Tr text="Want a message when a company comes near its low?" /> <Link href="/alerts#range-rules"><Tr text="Set a range rule on Alerts" /></Link></p>
        <QuickPickChips active={picks} onPick={(p, wasOn) => setParams({ pick: (wasOn ? picks.filter((k) => k !== p.key) : [...picks, p.key]).join(',') })} />
      </div>

      <div className="panel filter-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {/* One choice of three, drawn like the page tabs (underline on the selected one). */}
        <div className="tabs who-tabs" role="group" aria-label={t('Who to show')}>
          {([['', 'All companies'], ['watchlist', 'My watchlist'], ['holdings', 'My holdings']] as const).map(([k, l]) => (
            <button key={l} type="button" className="tab-link" aria-pressed={who === k} onClick={() => setParams({ who: k })}><Tr text={l} /></button>
          ))}
        </div>
        <label className="within-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <span className="muted"><Tr text="Filter this list" />:</span> <Tr text="Within" />
          <input
            type="number" min={0.5} max={100} step={0.5}
            value={withinActive ? within : ''}
            aria-label={t('Within % of the low')}
            style={{ width: '70px' }}
            placeholder="—"
            onChange={(e) => setParams({ within: e.target.value || '' })} />
          <Tr text="% of the low" />
        </label>
        <label className="within-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <Tr text="Min score" />
          <input
            type="number" min={1} max={100} step={1}
            value={minScoreActive ? minScore : ''}
            aria-label={t('Minimum score (0 to 100)')}
            style={{ width: '70px' }}
            placeholder="—"
            onChange={(e) => setParams({ minScore: e.target.value || '' })} />
        </label>
        {(withinActive || minScoreActive) && (
          <button type="button" className="btn ghost" onClick={() => { setCompanyQ(''); setParams({ within: '', minScore: '', code: '' }); }}>
            <Tr text="Clear filters" />
          </button>
        )}
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
            <SortHeader k="range" label="52-week range" sort={sort} onSort={onSort} numeric />
            <SortHeader k="position" label="Position" sort={sort} onSort={onSort} />
            <SortHeader k="score" label="Score" sort={sort} onSort={onSort} numeric />
            {showHoldings && <>
              <SortHeader k="avgCost" label="Your avg price" sort={sort} onSort={onSort} numeric />
              <SortHeader k="gainPct" label="Your gain %" sort={sort} onSort={onSort} numeric />
              <SortHeader k="shares" label="Shares" sort={sort} onSort={onSort} numeric />
            </>}
          </tr></thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={showHoldings ? 8 : 5} className="empty">{t('Loading…')}</td></tr>
            ) : showHoldings && holdingsState !== 'ready' ? (
              <tr><td colSpan={8} className="empty">{holdingsState === 'failed' ? t('Could not load your holdings. Try again in a minute.') : t('Loading…')}</td></tr>
            ) : who === 'watchlist' && watchlistCodes.length === 0 ? (
              <tr><td colSpan={5} className="empty">
                <Tr text="Your watchlist is empty." />{' '}<Link href="/all"><Tr text="Browse companies" /></Link>.
              </td></tr>
            ) : showHoldings && holdingCount === 0 ? (
              <tr><td colSpan={8} className="empty">
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
                <td className="n mono nw" data-label={t('52-week range')}>{r.weekLow52 != null && r.weekHigh52 != null ? `৳${fmt(r.weekLow52)} – ৳${fmt(r.weekHigh52)}` : '—'}</td>
                <td data-label={t('Position in range')}>
                  {r.position != null && r.aboveLowPct != null ? <><PositionBar position={r.position} /> <span className="small mono">{r.aboveLowPct < 0
                    ? t(`${rangePct(r.position)}% of range · ${fmt(-r.aboveLowPct, 1)}% below low`)
                    : t(`${rangePct(r.position)}% of range · ${fmt(r.aboveLowPct, 1)}% above low`)}</span></> : '—'}
                </td>
                <td className="n mono" data-label={t('Score')}>{r.score != null ? r.score : '—'}</td>
                {showHoldings && <>
                  <td className="n mono" data-label={t('Your avg price')}>{r.avgCost != null ? `৳${fmt(r.avgCost)}` : '—'}</td>
                  <td className={`n mono ${tone(r.gainPct)}`} data-label={t('Your gain %')}>{signed(r.gainPct)}</td>
                  <td className="n mono" data-label={t('Shares')}>{r.shares != null ? r.shares.toLocaleString() : '—'}</td>
                </>}
              </tr>
            )) : (
              <tr><td colSpan={showHoldings ? 8 : 5} className="empty"><Tr text={picks.length > 1 ? 'No company passes all the quick picks you chose. Turn one off to see more.' : 'No company has figures in this filter.'} /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
