'use client';

import { Line } from 'react-chartjs-2';
import { ChartBox, useChartColors } from '@/components/charts';
import { fmt, signed, tone } from '@/components/format';
import { Tr } from '@/components/Tr';
import type { CompanyDetail } from '@/lib/service';

type Position = NonNullable<CompanyDetail['position']>;
type Band = Position['price'];

function RangeBar({ title, band, unit, hint }: { title: string; band: Band; unit: (x: number) => string; hint: string }) {
  if (!band) return <div><b>{title}</b><p className="muted small">Not enough data.</p></div>;
  const pos = Math.round(Math.min(1, Math.max(0, band.position)) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{title}</b><span className="mono">{unit(band.now)}</span></div>
      <div className="range" role="img" aria-label={`${title}: ${pos}% of the way from low to high`}><i style={{ left: `${pos}%` }} /></div>
      <div className="range-labels mono"><span>Low {unit(band.low)}</span><span>Avg {unit(band.avg)}</span><span>High {unit(band.high)}</span></div>
      <p className="why">{hint}</p>
    </div>
  );
}

const NOTE_TONE: Record<string, string> = { good: 'good', bad: 'bad', warn: 'warn', neutral: '' };

function PeTrend({ points }: { points: NonNullable<CompanyDetail['company']['peTrend']> }) {
  const colors = useChartColors();
  if (!points.length) return null;
  return (
    <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="P/E over the last 30 trading days" /></h3>
      {colors ? (
        <ChartBox label={'P/E by day: ' + points.map((x) => `${x.date} audited ${fmt(x.audited, 2)}, latest results ${fmt(x.unaudited, 2)}`).join('; ')}>
          <Line data={{ labels: points.map((x) => x.date), datasets: [
            { label: 'P/E (audited)', data: points.map((x) => x.audited ?? null), borderColor: colors['--accent'], pointRadius: 0, pointHoverRadius: 5, borderWidth: 2, tension: 0.2 },
            { label: 'P/E (latest results)', data: points.map((x) => x.unaudited ?? null), borderColor: colors['--warn'], borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 5, borderWidth: 2, tension: 0.2 },
          ] }} options={{ maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} ${fmt(ctx.parsed.y, 2)}` } } }, scales: { x: { ticks: { maxTicksLimit: 6 } } } }} />
        </ChartBox>) : null}
      <p className="why"><Tr text="Audited = price ÷ EPS of the last audited year. Latest results = price ÷ EPS from the latest unaudited quarters. Source: DSE." /></p>
    </div>
  );
}

export function Valuation({ p, peTrend }: { p: Position | null; peTrend: NonNullable<CompanyDetail['company']['peTrend']> }) {
  if (!p) return <><p className="muted">Not enough history.</p><PeTrend points={peTrend} /></>;
  const v = p.verdict;
  return (
    <>
    <div className="panel">
      <h3><Tr text="Is it cheap or expensive now?" /></h3>
      {v ? <div className={`note ${NOTE_TONE[v.tone] ?? ''}`}><b><Tr text={v.label} />:</b> {v.text}</div> : null}
      <div className="grid g2">
        <RangeBar title="Price vs last 5 years" band={p.price} unit={(x) => '৳' + fmt(x)}
          hint="Green end = near its 5-year low. Year-end prices are approximate (P/E × EPS) and not adjusted for bonus shares, so the P/E bar is the fairer test." />
        <RangeBar title="P/E vs last 5 years" band={p.pe} unit={(x) => fmt(x, 1)} hint="P/E is a fairer test than price, because it allows for profit growth." />
      </div>
      {p.history.length ? (
        <>
          <div className="table-wrap"><table className="cards">
            <thead><tr><th>Year</th><th className="n">P/E</th><th className="n">Price (approx.)</th><th className="n">A year later</th><th className="n">Change</th></tr></thead>
            <tbody>{p.history.map((h) => (
              <tr key={h.year}><td>{h.year}</td><td className="n mono" data-label="P/E">{fmt(h.pe, 1)}</td><td className="n mono" data-label="Price">৳{fmt(h.price)}</td>
                <td className="n mono" data-label="A year later">৳{fmt(h.nextPrice)}</td><td className={`n mono ${tone(h.change)}`} data-label="Change">{signed(h.change)}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="why">In the years when its P/E was at or below its usual {fmt(p.usualPe, 1)}, the price was higher a year later in <b>{p.cheapYearsUp} of {p.cheapYears}</b> cases.
            This is history, not a forecast: a few yearly points cannot predict the future.</p>
        </>
      ) : null}
    </div>
    <PeTrend points={peTrend} />
    </>
  );
}
