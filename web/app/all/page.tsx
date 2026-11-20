'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { Suspense, useMemo } from 'react';
import { useApi } from '@/components/AppProvider';
import { SortHeader } from '@/components/SortHeader';
import { WatchButton } from '@/components/Watchlist';
import { compareNullsLast, fmt, moneyPerDay, sectorName, signed, tone } from '@/components/format';
import { FRAUD, FraudPill, Icon, SIGNAL_ORDER, SIGNALS, SignalPill, type FraudLevel, type IconName, type Signal } from '@/components/ui';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface CompaniesResponse { rows: CompanyRow[]; codes: { code: string; sector: string }[]; medians: Record<string, number | null>; session: MarketSession | null }

const LIQUID_BDT = 1_000_000;
type Medians = Record<string, number | null>;
const PRESETS: { key: string; label: string; icon: IconName; tone: string; hint: string; sort: string; dir: number; test: (r: CompanyRow, m: Medians) => boolean }[] = [
  { key: 'good', label: 'Good companies', icon: 'research', tone: 'accent', hint: 'Passes every quality check, at any price.', sort: 'score', dir: -1,
    test: (r) => r.signal === 'research' },
  { key: 'cheap', label: 'Good and cheap', icon: 'tag', tone: 'accent', hint: 'Worth researching, with a P/E at or below its sector median.', sort: 'pe', dir: 1,
    test: (r, m) => r.signal === 'research' && r.pe != null && m[r.sector] != null && r.pe <= (m[r.sector] as number) },
  { key: 'dividend', label: 'High dividend', icon: 'coins', tone: 'up', hint: 'Yield 5%+ at today\'s price, no fraud flag, easy to trade.', sort: 'dividendYield', dir: -1,
    test: (r) => (r.dividendYield ?? 0) >= 5 && r.fraud === 'clean' && (r.dailyValue ?? 0) >= LIQUID_BDT },
  { key: 'growth', label: 'Rising earnings', icon: 'trend', tone: 'up', hint: 'Earnings per share growing 15%+ a year, no fraud flag.', sort: 'epsCagr', dir: -1,
    test: (r) => (r.epsCagr ?? -Infinity) >= 15 && r.fraud === 'clean' },
  { key: 'avoid', label: 'Risky — avoid', icon: 'caution', tone: 'down', hint: 'Loss-making, category Z or a high-risk fraud pattern.', sort: 'score', dir: 1, test: (r) => r.signal === 'avoid' },
];

// Cheapest P/E and A–Z code are the natural first view; everything else starts with the biggest value.
const ASCENDING_FIRST = new Set(['code', 'pe']);
const SORTS: [string, string][] = [['score', 'Score'], ['signalRank', 'Signal'], ['code', 'Company'], ['price', 'Price'], ['pe', 'P/E'], ['dividendYield', 'Yield'], ['dailyValue', 'Traded / day'], ['change1y', '1 year']];

const csvCell = (v: unknown) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

function downloadCsv(rows: CompanyRow[]) {
  const head = ['code', 'name', 'sector', 'category', 'signal', 'score', 'fraud', 'price', 'pe', 'dividend_yield_pct', 'traded_per_day_bdt', 'change_1y_pct', 'old_data'];
  const lines = rows.map((r) => [r.code, r.name, r.sector, r.category, r.signal, r.score, r.fraud, r.price, r.pe, r.dividendYield, r.dailyValue, r.change1y, r.stale ? 'yes' : ''].map(csvCell).join(','));
  const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'dse-companies.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const FILTERS = ['signal', 'sector', 'fraud', 'cat', 'yield', 'liquid'] as const;
type Filter = (typeof FILTERS)[number];

function AllCompanies() {
  const { t } = useLang();
  const { data, error } = useApi<CompaniesResponse>('/api/companies');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // A stored page can lack the sector ("—"); the live DSE list still knows it.
  const rows = useMemo(() => {
    const live = Object.fromEntries((data?.codes ?? []).map((c) => [c.code, c.sector]));
    return (data?.rows ?? []).map((r) => (r.sector && r.sector !== '—' ? r : { ...r, sector: live[r.code] || '' }));
  }, [data]);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort(), [rows]);
  const allowed: Record<Filter, readonly string[]> = {
    signal: Object.keys(SIGNALS), sector: sectors, fraud: Object.keys(FRAUD), cat: ['A', 'B', 'N', 'Z'], yield: ['3', '5', '8'], liquid: ['10', '100'],
  };
  // Ignore unknown URL values instead of filtering everything away.
  const state = Object.fromEntries(FILTERS.map((k) => [k, allowed[k].includes(params.get(k) || '') ? params.get(k) || '' : ''])) as Record<Filter, string>;
  const sort = { key: params.get('sort') || 'score', dir: Number(params.get('dir')) || -1 };

  const setParams = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === '' || (k === 'sort' && v === 'score') || (k === 'dir' && v === -1)) q.delete(k); else q.set(k, String(v)); }
    router.replace(pathname + (q.toString() ? '?' + q : ''), { scroll: false });
  };
  const onSort = (k: string) => setParams({ sort: k, dir: sort.key === k ? -sort.dir : ASCENDING_FIRST.has(k) ? 1 : -1 });

  const key = (r: CompanyRow): unknown => (sort.key === 'signalRank' ? SIGNAL_ORDER[r.signal as Signal] * 1000 + r.score : (r as unknown as Record<string, unknown>)[sort.key]);
  const preset = PRESETS.find((p) => p.key === params.get('preset'));
  const shown = rows
    .filter((r) => !preset || preset.test(r, data?.medians || {}))
    .filter((r) => (!state.signal || r.signal === state.signal) && (!state.sector || r.sector === state.sector) && (!state.fraud || r.fraud === state.fraud)
      && (!state.cat || r.category === state.cat) && (!state.yield || (r.dividendYield ?? 0) >= Number(state.yield))
      && (!state.liquid || (r.dailyValue ?? 0) >= Number(state.liquid) * 1e5))
    .sort((a, b) => compareNullsLast(key(a), key(b), sort.dir));

  if (error && !data) return <div className="note bad">Could not load the companies: {error}</div>;
  const fresh = rows.filter((r) => !r.stale).length;

  const select = (k: Filter, label: string, icon: IconName, options: [string, string][]) => (
    <span className="select-ic"><Icon name={icon} />
      <select id={'f-' + k} aria-label={label} value={state[k]} onChange={(e) => setParams({ [k]: e.target.value })}>
        {options.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
      </select>
    </span>
  );

  return (
    <>
      <h1><Tr text="All companies" /></h1>
      <p className="muted">{rows.length} companies listed{fresh < rows.length ? `, ${fresh} with the newest data` : ''}. Click a row for the full explanation.</p>
      <div role="group" aria-label={t('Quick picks:')} className="presets">
        <span className="small muted"><Tr text="Quick picks:" /></span>
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className={`btn chip chip-${p.tone}${preset?.key === p.key ? ' active' : ''}`} aria-pressed={preset?.key === p.key} title={t(p.hint)}
            onClick={() => setParams(preset?.key === p.key ? { preset: '', sort: 'score', dir: -1 } : { preset: p.key, sort: p.sort, dir: p.dir })}><Icon name={p.icon} /><Tr text={p.label} /></button>
        ))}
      </div>
      {preset ? <p className="small muted"><Tr text={preset.label} />: {t(preset.hint)}</p> : null}
      <div className="filters all-filters">
        {select('signal', 'Signal', 'research', [['', 'Any signal'], ...Object.entries(SIGNALS).map(([k, s]) => [k, s.label] as [string, string])])}
        {select('sector', 'Sector', 'grid', [['', 'All sectors'], ...sectors.map((s) => [s, sectorName(s)] as [string, string])])}
        {select('fraud', 'Fraud check', 'clean', [['', 'Any fraud risk'], ...Object.entries(FRAUD) as [string, string][]])}
        {select('cat', 'Category', 'list', [['', 'Any category'], ...['A', 'B', 'N', 'Z'].map((c) => [c, 'Category ' + c] as [string, string])])}
        {select('yield', 'Dividend yield', 'coins', [['', 'Any dividend yield'], ['3', 'Yield 3%+'], ['5', 'Yield 5%+'], ['8', 'Yield 8%+']])}
        {select('liquid', 'Trading', 'columns', [['', 'Any trading volume'], ['10', '৳0.1 cr+ a day'], ['100', '৳1 cr+ a day']])}
        <span className="small muted" aria-live="polite" style={{ alignSelf: 'center' }}>{t('Showing {n} companies').replace('{n}', String(shown.length))}</span>
        <button type="button" className="btn" onClick={() => downloadCsv(shown)} disabled={!shown.length}>
          <Icon name="download" />{t('Download list')} <span className="small muted">(Excel / CSV)</span></button>
      </div>
      {/* Phones hide the table header that holds the sort buttons, so the card layout gets its own control. */}
      <div className="filters card-sort">
        <select aria-label={t('Sort by')} value={sort.key} onChange={(e) => setParams({ sort: e.target.value, dir: ASCENDING_FIRST.has(e.target.value) ? 1 : -1 })}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{t('Sort by')}: {t(l)}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => setParams({ dir: -sort.dir })}>{sort.dir > 0 ? t('Low to high') : t('High to low')}</button>
      </div>
      <div className="panel table-wrap">
        <table className="cards">
          <thead><tr>
            <SortHeader k="code" label="Company" sort={sort} onSort={onSort} /><SortHeader k="signalRank" label="Signal" sort={sort} onSort={onSort} /><th><Tr text="Fraud check" /></th>
            <SortHeader k="score" label="Score" sort={sort} onSort={onSort} numeric /><SortHeader k="price" label="Price" sort={sort} onSort={onSort} numeric />
            <SortHeader k="pe" label="P/E" sort={sort} onSort={onSort} numeric /><SortHeader k="dividendYield" label="Yield" sort={sort} onSort={onSort} numeric />
            <SortHeader k="dailyValue" label="Traded / day" sort={sort} onSort={onSort} numeric /><SortHeader k="change1y" label="1 year" sort={sort} onSort={onSort} numeric />
          </tr></thead>
          <tbody>{!data ? <tr><td colSpan={9} className="empty">{t('Loading…')}</td></tr> : shown.length ? shown.map((r) => (
            <tr key={r.code} onClick={() => router.push('/c/' + encodeURIComponent(r.code))}>
              <td><div className="co-cell"><WatchButton code={r.code} /><div><a className="mono" href={'/c/' + encodeURIComponent(r.code)} onClick={(e) => e.stopPropagation()}><b>{r.code}</b></a>
                <div className="small muted">{r.name}{r.sector ? ' · ' + sectorName(r.sector) : ''} · {t('Category')} {r.category}</div>
                {r.stale ? <span className="pill s-neutral" title={t('Saved before the latest rule update; it refreshes in the background.')}>{t('old data')}</span> : null}</div></div></td>
              <td data-label="Signal"><SignalPill signal={r.signal as Signal} /></td>
              <td data-label="Fraud check"><FraudPill level={r.fraud as FraudLevel} />{r.flags.length ? <div className="small muted">{r.flags.join(', ')}</div> : null}</td>
              <td className="n mono" data-label="Score">{r.score}</td><td className="n mono" data-label="Price">৳{fmt(r.price)}</td>
              <td className="n mono" data-label="P/E">{fmt(r.pe, 1)}</td><td className="n mono" data-label="Yield">{r.dividendYield != null ? fmt(r.dividendYield, 1) + '%' : '—'}</td>
              <td className="n mono" data-label="Traded / day">{moneyPerDay(r.dailyValue)}</td>
              <td className={`n mono ${tone(r.change1y)}`} data-label="1 year">{signed(r.change1y)}</td>
            </tr>
          )) : <tr><td colSpan={9} className="empty">{t('No company matches these filters.')}</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}

export default function AllCompaniesPage() {
  return <Suspense fallback={<div className="empty">Loading…</div>}><AllCompanies /></Suspense>;
}
