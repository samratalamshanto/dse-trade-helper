'use client';

import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { ChartBox, dateTicks, useChartColors } from '@/components/charts';
import { Tr } from '@/components/Tr';
import { fmt, fmtDate, monthName, signed, tone } from '@/components/format';
import type { CompanyDetail } from '@/lib/service';

type History = NonNullable<CompanyDetail['priceHistory']>;
type Point = CompanyDetail['company']['series'][number];
type ExDate = History['exDates'][number];

const exLabel = (e: ExDate) => [e.cashPct ? 'ex-dividend' : '', e.stockPct ? 'ex-bonus' : ''].filter(Boolean).join(' + ') || 'ex-date';
const ADJUSTED = 'Percent changes are adjusted for dividends and bonus shares, so an ex-date drop is not counted as a fall. Prices are as traded.';

const taka = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : '৳' + fmt(v));

function Summary({ h }: { h: History }) {
  const streak = (s: History['longestUp']) => (s ? `${s.days} days (${fmtDate(s.from)} – ${fmtDate(s.to)}, ${signed(s.pct)})` : '—');
  return (
    <div className="facts">
      <div className="fact"><div className="k"><Tr text="Period" /></div><div className="v">{fmtDate(h.from)} – {fmtDate(h.to)} · {h.days} <Tr text="trading days" /></div></div>
      <div className="fact"><div className="k"><Tr text="1-year change" /></div><div className={`v ${tone(h.changePct)}`}>{signed(h.changePct)}</div></div>
      {h.sinceJan != null ? <div className="fact"><div className="k"><Tr text="Since 1 Jan" /></div><div className={`v ${tone(h.sinceJan)}`}>{signed(h.sinceJan)}</div></div> : null}
      {h.noTradeDays ? <div className="fact"><div className="k"><Tr text="Days with no trades" /></div><div className="v">{h.noTradeDays}</div></div> : null}
      <div className="fact"><div className="k"><Tr text="Highest close" /></div><div className="v">{taka(h.high.price)} · {fmtDate(h.high.date)}</div></div>
      <div className="fact"><div className="k"><Tr text="Lowest close" /></div><div className="v">{taka(h.low.price)} · {fmtDate(h.low.date)}</div></div>
      <div className="fact"><div className="k"><Tr text="Highest price in a day" /></div><div className="v">{taka(h.dayHigh.price)} · {fmtDate(h.dayHigh.date)}</div></div>
      <div className="fact"><div className="k"><Tr text="Lowest price in a day" /></div><div className="v">{taka(h.dayLow.price)} · {fmtDate(h.dayLow.date)}</div></div>
      <div className="fact"><div className="k"><Tr text="Up days vs down days" /></div><div className="v"><span className="up">{h.upDays}</span> / <span className="down">{h.downDays}</span></div></div>
      <div className="fact"><div className="k"><Tr text="Longest rise in a row" /></div><div className="v">{streak(h.longestUp)}</div></div>
      <div className="fact"><div className="k"><Tr text="Longest fall in a row" /></div><div className="v">{streak(h.longestDown)}</div></div>
    </div>
  );
}

function BandChart({ series, exDates }: { series: Point[]; exDates: ExDate[] }) {
  const colors = useChartColors();
  if (!colors || series.length < 2) return null;
  const band = colors['--accent'] + '22', ex = new Set(exDates.map((e) => e.date));
  return (
    <ChartBox label={`Daily closing price with the day's high and low, ${fmtDate(series[0].date)} to ${fmtDate(series.at(-1)!.date)}`}>
      <Line data={{ labels: series.map((x) => x.date), datasets: [
        { label: 'High', data: series.map((x) => (x.high && x.high > 0 ? x.high : x.price)), borderColor: 'transparent', backgroundColor: band, pointRadius: 0, fill: false },
        { label: 'Low', data: series.map((x) => (x.low && x.low > 0 ? x.low : x.price)), borderColor: 'transparent', backgroundColor: band, pointRadius: 0, fill: '-1' },
        { label: 'Close', data: series.map((x) => x.price), borderColor: colors['--accent'], pointRadius: 0, pointHoverRadius: 5, borderWidth: 2, tension: 0.2, fill: false },
        ...(ex.size ? [{ label: 'Ex-date, close', data: series.map((x) => (ex.has(x.date) ? x.price : null)), showLine: false, pointStyle: 'triangle' as const, pointRadius: 7, borderColor: colors['--warn'], backgroundColor: colors['--warn'] }] : []),
      ] }}
        options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { filter: (ctx) => ctx.parsed.y != null, callbacks: { label: (ctx) => `${ctx.dataset.label} ৳${fmt(ctx.parsed.y)}` } } }, scales: { x: { ticks: dateTicks } } }} />
    </ChartBox>
  );
}

function DaysTable({ title, rows }: { title: string; rows: History['bestDays'] }) {
  return (
    <div className="panel table-wrap"><h3><Tr text={title} /></h3>
      {rows.length ? (
        <table><thead><tr><th>Date</th><th className="n">Close</th><th className="n">Change</th><th className="n">Volume</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.date}><td className="mono">{fmtDate(r.date)}</td><td className="n mono">{taka(r.close)}</td><td className={`n mono ${tone(r.pct)}`}>{signed(r.pct, 2)}</td><td className="n mono">{fmt(r.volume, 0)}</td></tr>)}</tbody></table>
      ) : <p className="muted small"><Tr text="None in this period." /></p>}
    </div>
  );
}

export function PriceHistory({ h, series }: { h: CompanyDetail['priceHistory']; series: Point[] }) {
  const [small, setSmall] = useState(false);
  const [open, setOpen] = useState(false);
  if (!h) return <p className="muted"><Tr text="No price history from DSE yet." /></p>;
  if (h.illiquid) return <div className="note warn"><Tr text="No trades in 52 weeks" /> (<Tr text="last trade" />: {h.lastTradeDate ? fmtDate(h.lastTradeDate) : '—'}).</div>;
  const pts = series.filter((p) => Number.isFinite(p.price) && p.price > 0);
  // The chart and the daily table show the summary's 52-week window; the first day's change still uses the close before it.
  const daily = pts.map((p, i) => ({ ...p, pct: i ? ((p.price - pts[i - 1].price) / pts[i - 1].price) * 100 : null })).filter((p) => p.date >= h.from).reverse();
  const windowPts = pts.filter((p) => p.date >= h.from);
  const exDates = h.exDates ?? [], exByDate = new Map(exDates.map((e) => [e.date, e]));
  const useSmall = small && !!h.swingsSmall, swings = useSmall ? h.swingsSmall : h.swings, min = useSmall ? 5 : 10;
  return (
    <>
      <div className="panel"><h3><Tr text="The last 52 weeks in short" /></h3><Summary h={h} />
        <p className="why"><Tr text="Close = the last price of the day. The day's high and low can be above or below the close." /></p></div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Daily close and the day's high–low band" /></h3><BandChart series={windowPts} exDates={exDates} />
        {exDates.length ? <p className="why"><Tr text="Triangles mark ex-dates: the first day without the dividend or bonus, when the price usually drops by about its value." /></p> : null}</div>
      <div className="panel table-wrap" style={{ marginTop: 14 }}><h3><Tr text="When it rose and fell" /></h3>
        {h.swingsSmall ? (
          <div role="group" aria-label="Move size" className="range-btns" style={{ marginBottom: 8 }}>
            {[[true, '5%'], [false, '10%']].map(([v, l]) => <button key={String(l)} type="button" className={`btn${small === v ? ' active' : ''}`} aria-pressed={small === v} onClick={() => setSmall(v as boolean)}>{l}</button>)}
          </div>) : null}
        {swings.length ? (
          <table className="cards"><thead><tr><th>Move</th><th>From</th><th>To</th><th className="n">Price</th><th className="n">Change</th><th className="n">Trading days</th></tr></thead>
            <tbody>{swings.map((w) => (
              <tr key={w.from + w.kind}><td><b className={w.kind === 'rise' ? 'up' : 'down'}><Tr text={w.kind === 'rise' ? 'Rise' : 'Fall'} /></b></td>
                <td data-label="From" className="mono">{fmtDate(w.from)}</td><td data-label="To" className="mono">{fmtDate(w.to)}</td>
                <td data-label="Price" className="n mono">{taka(w.fromPrice)} → {taka(w.toPrice)}</td><td data-label="Change" className={`n mono ${tone(w.pct)}`}>{signed(w.pct)}</td><td data-label="Trading days" className="n mono">{w.days}</td></tr>
            ))}</tbody></table>
        ) : <p className="muted small">No move of {min}% or more in this period.</p>}
        <p className="why">A move counts once the closing price turns by {min}% or more from the last turning point.{exDates.length ? ' ' + ADJUSTED : ''}</p></div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Month by month" /></h3>
        <div className="table-wrap table-scroll"><table className="cards"><thead><tr><th>Month</th><th className="n">Open</th><th className="n">High</th><th className="n">Low</th><th className="n">Close</th><th className="n">Change</th><th className="n">Avg volume / day</th><th className="n">Trades</th></tr></thead>
          <tbody>{[...h.months].reverse().map((m) => (
            <tr key={m.month}><td><b>{monthName(m.month)}</b>{m.partial ? <span className="small muted"> (partial, {m.days} days)</span> : null}</td><td data-label="Open" className="n mono">{taka(m.open)}</td><td data-label="High" className="n mono">{taka(m.high)}</td><td data-label="Low" className="n mono">{taka(m.low)}</td><td data-label="Close" className="n mono">{taka(m.close)}</td>
              <td data-label="Change" className={`n mono ${tone(m.changePct)}`}>{signed(m.changePct)}</td><td data-label="Avg volume / day" className="n mono">{fmt(m.avgVolume, 0)}</td><td data-label="Trades" className="n mono">{fmt(m.trades, 0)}</td></tr>
          ))}</tbody></table></div></div>
      <div className="grid g2" style={{ marginTop: 14 }}><DaysTable title="Best 5 days" rows={h.bestDays} /><DaysTable title="Worst 5 days" rows={h.worstDays} /></div>
      {exDates.length ? <p className="why">{ADJUSTED}</p> : null}
      <div className="panel" style={{ marginTop: 14 }}>
        <details onToggle={(e) => setOpen(e.currentTarget.open)}><summary className="toggle-btn">{open ? 'Hide' : 'Show'} every trading day ({daily.length})</summary><div className="table-wrap table-scroll">
          <table><thead><tr><th>Date</th><th className="n">Close</th><th className="n">Change</th><th className="n">Open</th><th className="n">High</th><th className="n">Low</th><th className="n">Volume</th><th className="n">Trades</th></tr></thead>
            <tbody>{daily.map((p) => { const ex = exByDate.get(p.date); return (
              <tr key={p.date}><td className="mono">{fmtDate(p.date)}{ex ? <> <span className="pill s-info">{exLabel(ex)}</span></> : null}</td><td className="n mono">{taka(p.price)}</td>
                <td className={`n mono ${tone(p.pct)}`}>{signed(p.pct, 2)}</td><td className="n mono">{taka(p.open)}</td><td className="n mono">{taka(p.high)}</td><td className="n mono">{taka(p.low)}</td><td className="n mono">{fmt(p.volume, 0)}</td><td className="n mono">{fmt(p.trades, 0)}</td></tr>
            ); })}</tbody></table></div></details></div>
    </>
  );
}
