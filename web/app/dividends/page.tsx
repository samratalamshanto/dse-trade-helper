'use client';

import { useRouter } from 'next/navigation';
import { Tr } from '@/components/Tr';
import { CompanyTabs } from '@/components/CompanyTabs';
import { useState } from 'react';
import { useApi } from '@/components/AppProvider';
import { isTooLate, LastBuy } from '@/components/LastBuy';
import { SortHeader, type SortState } from '@/components/SortHeader';
import { compareNullsLast, fmt, fmtDate, monthName, pctNum, sectorName } from '@/components/format';
import { FraudPill, Info, type FraudLevel } from '@/components/ui';
import type { CalendarRow, dividendCalendar } from '@/lib/service';

type Calendar = Awaited<ReturnType<typeof dividendCalendar>>;

function CompanyCell({ r }: { r: CalendarRow }) {
  return (
    <td><b className="mono">{r.code}</b> {r.fraud !== 'clean' ? <FraudPill level={r.fraud as FraudLevel} /> : null}
      <div className="small muted">{r.name}{r.sector ? ' · ' + sectorName(r.sector) : ''} · Cat {r.category}</div></td>
  );
}

function DividendCell({ r }: { r: CalendarRow }) {
  return (
    <td data-label="Dividend">{r.cashPct != null ? <>{pctNum(r.cashPct)}% <Tr text="cash" /></> : '—'}{r.stockPct ? <> + {pctNum(r.stockPct)}% <Tr text="bonus" /></> : null}
      {r.interim ? <> <span className="pill s-neutral"><Tr text="interim" /></span></> : null}{r.partial ? <> <span className="pill s-caution"><Tr text="not for sponsors" /></span></> : null}</td>
  );
}

const YieldCell = ({ r }: { r: CalendarRow }) => (
  <td data-label="12-month cash yield" className="n mono">{r.yieldPct != null ? <>{fmt(r.yieldPct, 2)}%{r.yieldBasis ? <> <Info text={r.yieldBasis} /></> : null}{r.yieldPct < 1 ? <> <span className="pill s-neutral"><Tr text="tiny" /></span></> : null}</> : '—'}</td>
);

export default function DividendsPage() {
  const { data: d, error } = useApi<Calendar>('/api/dividends');
  const router = useRouter();
  const [sort, setSort] = useState<SortState>({ key: 'recordDate', dir: 1 });
  const [showPast, setShowPast] = useState(false);
  // Title and tabs stay on screen while the data loads, so a tab change does not look like a page reload.
  const head = <><h1><Tr text="Dividend calendar" /></h1><CompanyTabs /></>;
  if (error && !d) return <>{head}<div className="note bad">Could not load the dividend calendar: {error}</div></>;
  if (!d) return <>{head}<div className="empty">Loading…</div></>;

  const onSort = (k: string) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : k === 'yieldPct' ? -1 : 1 }));
  const get = (r: CalendarRow, k: string) => (r as unknown as Record<string, unknown>)[k];
  const pastCount = d.upcoming.filter((r) => isTooLate(r, d.today)).length;
  // Companies without a fraud flag first; inside each group the chosen column decides the order.
  const upcoming = d.upcoming.filter((r) => showPast || !isTooLate(r, d.today))
    .sort((a, b) => Number(a.fraud !== 'clean') - Number(b.fraud !== 'clean') || compareNullsLast(get(a, sort.key), get(b, sort.key), sort.dir));
  const open = (code: string) => router.push('/c/' + encodeURIComponent(code));

  return (
    <>
      {head}
      <div className="note"><b>How to get a dividend:</b> buy the share on or before the <b>last day to buy</b>. Owners on the <b>record date</b> receive it after the AGM approves it.
        The price usually falls by about the dividend after the record date, so a dividend is not free money.
        <br /><b>12-month cash yield</b> = all cash dividends announced in the last 12 months (interim + final) ÷ today&apos;s price. Bonus shares are not cash. Tap the i next to a yield to see its sum.</div>

      <h2><Tr text="Upcoming record dates" /></h2>
      <div className="filters filters-center">
        <label className="check small"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          <span><Tr text="Show rows where the last day to buy has passed" /> ({pastCount})</span></label>
        <span className="small muted"><Tr text="Companies with no fraud flag are listed first." /></span>
      </div>
      <div className="panel table-wrap"><table className="cards">
        <thead><tr>
          <SortHeader k="code" label="Company" sort={sort} onSort={onSort} /><th>Dividend</th>
          <SortHeader k="cashPerShare" label="Cash / share" sort={sort} onSort={onSort} numeric /><SortHeader k="price" label="Price" sort={sort} onSort={onSort} numeric />
          <SortHeader k="yieldPct" label="12-month cash yield" sort={sort} onSort={onSort} numeric /><SortHeader k="lastBuyDate" label="Last day to buy" sort={sort} onSort={onSort} />
          <SortHeader k="recordDate" label="Record date" sort={sort} onSort={onSort} />
        </tr></thead>
        <tbody>{upcoming.length ? upcoming.map((r) => (
          <tr key={r.code} onClick={() => open(r.code)}><CompanyCell r={r} /><DividendCell r={r} />
            <td data-label="Cash / share" className="n mono">{r.cashPerShare != null ? '৳' + fmt(r.cashPerShare) : '—'}</td>
            <td data-label="Price" className="n mono">৳{fmt(r.price)}</td><YieldCell r={r} />
            <td data-label="Last day to buy"><LastBuy r={r} /></td><td data-label="Record date" className="mono">{fmtDate(r.recordDate)}</td></tr>
        )) : <tr><td colSpan={7} className="empty"><Tr text="No dividend you can still buy for. Tick the box above to see the ones that closed." /></td></tr>}</tbody>
      </table></div>

      <h2>Declared in the last 60 days (record date passed)</h2>
      <div className="panel table-wrap"><table className="cards">
        <thead><tr><th>Company</th><th>Dividend</th><th className="n"><Tr text="12-month cash yield" /></th><th>Announced</th><th>Record date</th></tr></thead>
        <tbody>{d.recent.length ? d.recent.map((r) => (
          <tr key={r.code} onClick={() => open(r.code)}><CompanyCell r={r} /><DividendCell r={r} /><YieldCell r={r} />
            <td data-label="Announced" className="mono">{fmtDate(r.announced)}</td><td data-label="Record date" className="mono">{fmtDate(r.recordDate)}</td></tr>
        )) : <tr><td colSpan={5} className="empty">None.</td></tr>}</tbody>
      </table></div>

      <h2><Tr text="Expected next announcements" /></h2>
      <p className="muted small">Estimated from last year&apos;s announcement month. &quot;Regular&quot; means the last two years matched within about 6 weeks.</p>
      <div className="panel table-wrap"><table className="cards">
        <thead><tr><th>Company</th><th>Last dividend</th><th className="n"><Tr text="12-month cash yield" /></th><th>Expected</th></tr></thead>
        <tbody>{d.expected.length ? d.expected.slice(0, 80).map((r) => (
          <tr key={r.code} onClick={() => open(r.code)}><CompanyCell r={r} /><DividendCell r={r} /><YieldCell r={r} />
            <td data-label="Expected">{monthName(r.nextExpected)}{r.regular ? <> <span className="pill s-research">regular</span></> : null}</td></tr>
        )) : <tr><td colSpan={4} className="empty">None yet.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
