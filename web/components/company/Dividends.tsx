import { LastBuy } from '@/components/LastBuy';
import { Tr } from '@/components/Tr';
import { fmt, fmtDate, monthName, pctNum } from '@/components/format';
import { Icon, Info } from '@/components/ui';
import type { CompanyDetail } from '@/lib/service';

type Dividend = CompanyDetail['dividend'];

function Status({ dv, face }: { dv: Dividend; face: number }) {
  const up = dv?.upcoming;
  const next = dv?.nextExpected ? <> Next announcement expected around <b>{monthName(dv.nextExpected)}</b>.</> : null;
  if (up && dv.canStillBuy) {
    return (
      <div className="note good"><b>Dividend coming:</b> {pctNum(up.cashPct)}% cash{up.stockPct ? ` + ${pctNum(up.stockPct)}% bonus shares` : ''}
        {up.cashPct != null ? ` (৳${fmt((up.cashPct / 100) * face)} a share)` : ''}. <b>Last day to buy: {fmtDate(up.lastBuyDate)}</b>
        {up.lastBuyEstimated ? ' (estimate: DSE posts the exact day a few days before)' : ' (from DSE spot-market notice)'}. Record date {fmtDate(up.recordDate)}.
        It still needs approval at the AGM{up.agmDate ? ` on ${fmtDate(up.agmDate)}` : ''}. The price usually drops by about the dividend after the record date.</div>
    );
  }
  if (up) return <div className="note warn"><b>Too late for this one:</b> the last day to buy for the {pctNum(up.cashPct)}% dividend was {fmtDate(up.lastBuyDate)}. Record date {fmtDate(up.recordDate)}.{next}</div>;
  if (dv?.recordToday) return <div className="note warn"><b>Today is the record date</b> for the {pctNum(dv.recordToday.cashPct)}% dividend. Buying today does not qualify.{next}</div>;
  if (dv?.latest) {
    return (
      <div className="note warn"><b>No dividend coming soon.</b> The last one ({pctNum(dv.latest.cashPct)}% cash) had its record date on {fmtDate(dv.latest.recordDate)}.
        {dv.nextExpected ? <> Next announcement expected around <b>{monthName(dv.nextExpected)}</b>{dv.regular ? ', based on its regular timing' : ' (estimate from one year only)'}.</> : null}</div>
    );
  }
  return <div className="note">No dividend announcement in DSE&apos;s recent news for this company.</div>;
}

export function Dividends({ d }: { d: CompanyDetail }) {
  const c = d.company, s = d.summary, face = c.faceValue || 10;
  const decl = c.events?.declarations || [];
  return (
    <>
      <Status dv={d.dividend} face={face} />
      <div className="panel table-wrap"><h3>Announcements <Info text="From DSE company news for about the last 2 years. Cash per share = cash % × face value." /></h3>
        {decl.length ? (
          <table className="cards"><thead><tr><th>Announced</th><th>Dividend</th><th className="n">Cash / share</th><th>Last day to buy</th><th>Record date</th><th>AGM</th><th>Paid</th></tr></thead>
            <tbody>{decl.map((x, i) => (
              <tr key={(x.announced || '') + i}>
                <td data-label="Announced">{fmtDate(x.announced)}</td>
                <td data-label="Dividend">{x.cashPct != null ? pctNum(x.cashPct) + '% cash' : ''}{x.stockPct ? ` + ${pctNum(x.stockPct)}% bonus` : ''}
                  {x.cashPct == null && !x.stockPct ? (x.noDividend ? <b>No dividend</b> : 'see DSE') : null}
                  {x.interim ? <> <span className="pill s-neutral">interim</span></> : null}{x.partial ? <> <span className="pill s-caution">not for sponsors</span></> : null}</td>
                <td data-label="Cash per share" className="n mono">{x.cashPct != null ? '৳' + fmt((x.cashPct / 100) * face) : '—'}</td>
                <td data-label="Last day to buy"><LastBuy r={x} /></td>
                <td data-label="Record date" className="mono">{fmtDate(x.recordDate)}</td>
                <td data-label="AGM" className="mono">{fmtDate(x.agmDate)}</td>
                <td data-label="Paid">{x.paidOn ? <><Icon name="check" className="t-good" /> {fmtDate(x.paidOn)}</> : x.recordDate && x.recordDate < (d.dividend?.today || '') ? 'not yet' : '—'}</td>
              </tr>
            ))}</tbody></table>) : <p className="muted">None found.</p>}
      </div>
      {s.years.length ? (
        <div className="panel table-wrap" style={{ marginTop: 14 }}><h3><Tr text="5-year dividend record" /></h3>
          <table><thead><tr><th>Year</th><th className="n">Cash / share</th><th className="n">Bonus %</th><th className="n">Payout</th><th className="n">Yield</th><th>Rights</th></tr></thead>
            <tbody>{[...s.years].reverse().map((y) => (
              <tr key={y.year}><td>{y.year}</td><td className="n mono">{y.dps != null ? '৳' + fmt(y.dps) : '—'}</td><td className="n mono">{fmt(y.stockPct, 0)}</td>
                <td className="n mono">{y.payout != null ? fmt(y.payout, 0) + '%' : '—'}</td><td className="n mono">{y.dividendYield != null ? fmt(y.dividendYield, 1) + '%' : '—'}</td>
                <td className="mono">{String(c.dividends.find((x) => x.year === y.year)?.rights || '—')}</td></tr>
            ))}</tbody></table></div>) : null}
      {c.dividends.length ? (
        <div className="panel table-wrap" style={{ marginTop: 14 }}><h3><Tr text="DSE dividend history" /></h3>
          <table><thead><tr><th>Year</th><th className="n">Cash %</th><th className="n">Bonus (stock) %</th><th>Rights</th><th className="n">Yield</th></tr></thead>
            <tbody>{[...c.dividends].sort((a, b) => b.year - a.year).map((x, i) => (
              <tr key={x.year + '-' + i}><td>{x.year}</td><td className="n mono">{pctNum(x.cash)}</td><td className="n mono">{pctNum(x.stock)}</td><td className="mono">{String(x.rights || '—')}</td>
                <td className="n mono">{x.yieldPct != null ? fmt(x.yieldPct, 2) + '%' : '—'}</td></tr>
            ))}</tbody></table>
          <p className="why">Cash % is of the face value (৳{fmt(face, 0)}). Rights &quot;1R:2&quot; = one new share you may buy for every 2 you hold.</p></div>) : null}
      <p className="why">Record date: you must own the share on this day to get the dividend. AGM: the meeting where shareholders approve it. Payment usually comes within about 30 days after the AGM.</p>
    </>
  );
}
