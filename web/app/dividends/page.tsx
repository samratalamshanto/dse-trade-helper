'use client';

import { useRouter } from 'next/navigation';
import { Tr } from '@/components/Tr';
import { CompanyTabs } from '@/components/CompanyTabs';
import { bnDate, useLang } from '@/components/i18n';
import { useState, useSyncExternalStore } from 'react';
import { useApi } from '@/components/AppProvider';
import { isTooLate, LastBuy } from '@/components/LastBuy';
import { SortHeader, type SortState } from '@/components/SortHeader';
import { compareNullsLast, fmt, fmtDateLang, monthName, pctNum, sectorName } from '@/components/format';
import { FraudPill, Info, Skeleton, type FraudLevel } from '@/components/ui';
import { PillPopover } from '@/components/PillPopover';
import { FilterBox, matchesText } from '@/components/FilterBox';
import type { CalendarRow, dividendCalendar } from '@/lib/service';
import { checksOf, ValueCells } from '@/components/DividendValue';
import { daysUntil, passCount } from '@/lib/dividend-checks';

type Calendar = Awaited<ReturnType<typeof dividendCalendar>>;

function CompanyCell({ r }: { r: CalendarRow }) {
  const { t } = useLang();
  return (
    <td><b className="mono">{r.code}</b> {r.fraud !== 'clean' ? <FraudPill level={r.fraud as FraudLevel} href={'/c/' + encodeURIComponent(r.code) + '#safety'} flags={r.flags} /> : null}
      <div className="small muted">{r.name}{r.sector ? ' · ' + t(sectorName(r.sector)) : ''} · {t('Cat')} {r.category}</div></td>
  );
}

function DividendCell({ r }: { r: CalendarRow }) {
  const { t } = useLang();
  return (
    <td data-label={t('Dividend')}>{r.cashPct != null ? t(`${pctNum(r.cashPct)}% cash`) : '—'}{r.stockPct ? <> + {t(`${pctNum(r.stockPct)}% bonus`)}</> : null}
      {r.interim ? <> <span className="pill s-neutral"><Tr text="interim" /></span></> : null}{r.partial ? <> <PillPopover className="pill s-caution" pill={<Tr text="not for sponsors" />} meaning="Sponsors and directors do not take this dividend. Only the other shareholders get it." /></> : null}</td>
  );
}

const SOON_DAYS = 30;
type Tab = 'upcoming' | 'declared' | 'expected';
const TABS: readonly (readonly [Tab, string])[] = [['upcoming', 'Upcoming'], ['declared', 'Declared'], ['expected', 'Expected']];
// [sort key, header, numeric]; every column of every table sorts.
const COLS: Record<Tab, readonly (readonly [string, string, boolean?])[]> = {
  upcoming: [['code', 'Company'], ['cashPct', 'Dividend'], ['cashPerShare', 'Cash / share', true], ['yieldPct', '12-month cash yield', true], ['lastBuyDate', 'Last day to buy'], ['recordDate', 'Record date'], ['checks', 'Dividend checks'], ['score', 'Score', true]],
  declared: [['code', 'Company'], ['cashPct', 'Dividend'], ['yieldPct', '12-month cash yield', true], ['announced', 'Announced'], ['recordDate', 'Record date'], ['checks', 'Dividend checks'], ['score', 'Score', true]],
  expected: [['code', 'Company'], ['cashPct', 'Last dividend'], ['yieldPct', '12-month cash yield', true], ['nextExpected', 'Expected'], ['checks', 'Dividend checks'], ['score', 'Score', true]],
};
// The default sort of each tab; an empty key keeps the server order. Only the default sort keeps "no warning sign first".
const DEFAULT_SORT: Record<Tab, SortState> = { upcoming: { key: 'recordDate', dir: 1 }, declared: { key: '', dir: 1 }, expected: { key: '', dir: 1 } };
const HIGH_FIRST = new Set(['yieldPct', 'checks', 'score', 'cashPct']);
const firstDir = (k: string) => (HIGH_FIRST.has(k) ? -1 : 1);

// The tab lives in the URL hash, so links and back/forward choose it.
const onHash = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const useHashTab = (): Tab => {
  const h = useSyncExternalStore(onHash, () => window.location.hash.slice(1), () => '');
  return TABS.some(([k]) => k === h) ? (h as Tab) : 'upcoming';
};

const YieldCell = ({ r }: { r: CalendarRow }) => (
  <td data-label="12-month cash yield" className="n mono">{r.yieldPct != null ? <>{fmt(r.yieldPct, 2)}%{r.yieldBasis ? <> <Info text={r.yieldBasis} /></> : null}{r.yieldPct < 1 ? <> <PillPopover className="pill s-neutral" pill={<Tr text="tiny" />} meaning="The cash paid in the last 12 months is less than 1% of the price." /></> : null}</> : '—'}</td>
);

function RecordCell({ r, today }: { r: CalendarRow; today: string }) {
  const { t, lang } = useLang();
  const n = daysUntil(today, r.recordDate);
  return (
    <td data-label={t('Record date')} className="mono">{fmtDateLang(r.recordDate, lang)}
      {n != null ? <div className="sub">{n === 0 ? t('record date today') : (n === 1 ? t(`next dividend in ${n} day`) : t(`next dividend in ${n} days`))}</div> : null}</td>
  );
}

export default function DividendsPage() {
  const { data: d, error } = useApi<Calendar>('/api/dividends');
  const { t, lang } = useLang();
  const router = useRouter();
  const tab = useHashTab();
  const [sorts, setSorts] = useState(DEFAULT_SORT);
  const [showPast, setShowPast] = useState(false);
  const [soon, setSoon] = useState(false);
  const [q, setQ] = useState('');
  // Title and tabs stay on screen while the data loads, so a tab change does not look like a page reload.
  const head = <><h1><Tr text="Dividends" /></h1><CompanyTabs /></>;
  if (error && !d) return <>{head}<div className="note bad">{t('Could not load the dividend calendar')}: {error}</div></>;
  if (!d) return <>{head}<Skeleton label={t('Loading dividends')} rows={8} /></>;

  const sort = sorts[tab], byDefault = sort === DEFAULT_SORT[tab];
  const setSort = (s: SortState) => setSorts((all) => ({ ...all, [tab]: s }));
  const onSort = (k: string) => setSort({ key: k, dir: sort.key === k ? -sort.dir : firstDir(k) });
  const get = (r: CalendarRow, k: string) => (k === 'checks' ? passCount(checksOf(r)) : (r as unknown as Record<string, unknown>)[k]);
  // The default sort lists companies without a warning sign first; a column the user picks sorts by that column only.
  const order = (rows: CalendarRow[]) => (sort.key ? rows.sort((a, b) => (byDefault ? Number(a.fraud !== 'clean') - Number(b.fraud !== 'clean') : 0) || compareNullsLast(get(a, sort.key), get(b, sort.key), sort.dir)) : rows);
  const pastCount = d.upcoming.filter((r) => isTooLate(r, d.today)).length;
  const hit = (r: CalendarRow) => matchesText(q, r.code, r.name);
  const lists: Record<Tab, CalendarRow[]> = {
    upcoming: d.upcoming.filter((r) => hit(r) && (showPast || !isTooLate(r, d.today)) && (!soon || (daysUntil(d.today, r.recordDate) ?? Infinity) <= SOON_DAYS)),
    declared: d.recent.filter(hit),
    expected: d.expected.filter(hit).slice(0, 80),
  };
  const rows = order([...lists[tab]]);
  const cols = COLS[tab];
  const open = (code: string) => router.push('/c/' + encodeURIComponent(code));
  const empty = (text: string) => <tr><td colSpan={cols.length} className="empty">{q ? <Tr text="No company matches the search." /> : t(text)}</td></tr>;

  return (
    <>
      {head}
      <details className="note"><summary><Tr text="How dividends work" /></summary><b>{t('How to get a dividend:')}</b> {t('buy the share on or before the last day to buy. Owners on the record date receive it after the AGM approves it.')}{' '}
        {t('The price usually falls by about the dividend after the record date, so a dividend is not free money.')}
        <br /><b>{t('12-month cash yield')}</b> {t("= all cash dividends announced in the last 12 months (interim + final) ÷ today's price. Bonus shares are not cash. Tap the i next to a yield to see its sum.")}</details>

      <div className="page-toolbar">
        <FilterBox value={q} onChange={setQ} label={t('Find a company (code or name)')} />
      </div>
      <div className="tabs" role="tablist" aria-label={t('Sections')}>
        {TABS.map(([k, l]) => (
          <a key={k} id={'tab-' + k} href={'#' + k} className="tab-link" role="tab" aria-selected={tab === k} aria-controls="div-panel">
            <Tr text={l} />&nbsp;<span className="count">{lists[k].length}</span></a>
        ))}
      </div>

      <section id="div-panel" role="tabpanel" aria-labelledby={'tab-' + tab}>
        {tab === 'upcoming' ? <><h2><Tr text="Upcoming record dates" /></h2>
          <div className="filters filters-center">
            <label className="check small"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              <span><Tr text="Show rows where the last day to buy has passed" /> ({pastCount})</span></label>
            <label className="check small"><input type="checkbox" checked={soon} onChange={(e) => setSoon(e.target.checked)} />
              <span><Tr text="Record date within 30 days" /></span></label>
            {byDefault ? <span className="small muted"><Tr text="Companies with no warning sign are listed first." /></span> : null}
          </div></> : null}
        {tab === 'declared' ? <h2>{t('Declared in the last 60 days (record date passed)')}</h2> : null}
        {tab === 'expected' ? <><h2><Tr text="Expected next announcements" /></h2>
          <p className="muted small">{t('Estimated from last year\'s announcement month. "Regular" means the last two years matched within about 6 weeks.')}</p></> : null}
        {/* Phones hide the table header that holds the sort buttons, so the cards get their own control. */}
        <div className="filters card-sort">
          <select aria-label={t('Sort by')} value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: firstDir(e.target.value) })}>
            {sort.key ? null : <option value="">{t('Sort by')}</option>}
            {cols.map(([k, l]) => <option key={k} value={k}>{t('Sort by')}: {t(l)}</option>)}
          </select>
          <button type="button" className="btn" disabled={!sort.key} onClick={() => setSort({ ...sort, dir: -sort.dir })}>{sort.dir > 0 ? t('Low to high') : t('High to low')}</button>
        </div>
        {tab === 'upcoming' ? <p className="muted small"><Tr text="On DSE the price usually drops by about the dividend after the record date. ৳ per ৳10,000 is the cash a ৳10,000 holding at today's price would get." /></p> : null}
        <div className="panel table-wrap"><table className="cards div-value">
          <thead><tr>{cols.map(([k, l, n]) => <SortHeader key={k} k={k} label={l} sort={sort} onSort={onSort} numeric={n} />)}</tr></thead>
          <tbody>
            {tab === 'upcoming' ? (rows.length ? rows.map((r) => (
              <tr key={r.code} onClick={() => open(r.code)}><CompanyCell r={r} /><DividendCell r={r} />
                <td data-label={t('Cash / share')} className="n mono">{r.cashPerShare != null ? '৳' + fmt(r.cashPerShare) : '—'}</td><YieldCell r={r} />
                <td data-label={t('Last day to buy')}><LastBuy r={r} /></td><RecordCell r={r} today={d.today} /><ValueCells r={r} upcoming /></tr>
            )) : empty('No dividend you can still buy for. Tick the box above to see the ones that closed.')) : null}
            {tab === 'declared' ? (rows.length ? rows.map((r) => (
              <tr key={r.code} onClick={() => open(r.code)}><CompanyCell r={r} /><DividendCell r={r} /><YieldCell r={r} />
                <td data-label={t('Announced')} className="mono">{fmtDateLang(r.announced, lang)}</td><td data-label={t('Record date')} className="mono">{fmtDateLang(r.recordDate, lang)}</td><ValueCells r={r} /></tr>
            )) : empty('None.')) : null}
            {tab === 'expected' ? (rows.length ? rows.map((r) => (
              <tr key={r.code} onClick={() => open(r.code)}><CompanyCell r={r} /><DividendCell r={r} /><YieldCell r={r} />
                <td data-label={t('Expected')}>{lang === 'bn' ? bnDate(monthName(r.nextExpected)) ?? monthName(r.nextExpected) : monthName(r.nextExpected)}{r.regular ? <> <PillPopover className="pill s-research" pill={<Tr text="regular" />} meaning="The last two dividends were announced within about 6 weeks of the same date, so the expected month is a fair guess." /></> : null}</td>
                <ValueCells r={r} /></tr>
            )) : empty('None yet.')) : null}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
