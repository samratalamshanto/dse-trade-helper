'use client';

import { Bar, Line } from 'react-chartjs-2';
import { cagr, trendSeries, type TrendKey } from '@/lib/financial-trends';
import { interimIsFresh } from '@/lib/analysis';
import { ChartBox, useChartColors } from '@/components/charts';
import { fmt, signed, tone } from '@/components/format';
import type { CompanyDetail } from '@/lib/service';

type Summary = CompanyDetail['summary'];
type YearKey = 'profit' | 'eps' | 'nav' | 'roe' | 'dps' | 'payout' | 'pe' | 'dividendYield';

const ROWS: [string, YearKey | 'pb' | 'stockPct', number][] = [
  ['Net profit (৳ mn)', 'profit', 0], ['EPS (৳)', 'eps', 2], ['NAV / share (৳)', 'nav', 2], ['ROE (%)', 'roe', 1], ['P/E', 'pe', 1], ['P/B', 'pb', 2],
  ['Cash dividend / share (৳)', 'dps', 2], ['Bonus shares (%)', 'stockPct', 0], ['Payout (%)', 'payout', 0], ['Dividend yield (%)', 'dividendYield', 1],
];

const QUARTERS: [string, string, number][] = [['q1', '3 months (Q1)', 4], ['half', '6 months', 2], ['q3', 'Q3 alone', 4], ['nine', '9 months', 4 / 3]];

// Simple full-year pace from the latest interim figure; seasonal businesses can differ a lot.
const TRENDS: { key: TrendKey; label: string; unit: (v: number) => string; why: string }[] = [
  { key: 'profit', label: 'Net profit', unit: (v) => '৳' + fmt(v, 0) + ' cr', why: 'What the company earned in the year after all costs and tax.' },
  { key: 'eps', label: 'EPS', unit: (v) => '৳' + fmt(v), why: 'Profit for each share. If it rises year after year, each share earns more.' },
  { key: 'nav', label: 'NAV per share (equity per share)', unit: (v) => '৳' + fmt(v), why: 'What each share owns after all debts. Growth means the company keeps building value.' },
  { key: 'roe', label: 'Return on equity (ROE)', unit: (v) => fmt(v, 1) + '%', why: 'EPS ÷ NAV: profit made on the owners\' money. Above 15% is strong for DSE.' },
  { key: 'payout', label: 'Dividend payout', unit: (v) => fmt(v, 0) + '%', why: 'Cash dividend per share ÷ EPS. Above 100% means it pays out more than it earns, which cannot last.' },
  { key: 'pe', label: 'P/E at year end', unit: (v) => fmt(v, 1), why: 'How many taka investors paid for ৳1 of yearly profit. Compare today with these years.' },
  { key: 'pb', label: 'P/B at year end', unit: (v) => fmt(v, 2), why: 'Year-end price ÷ NAV. Above 5 is expensive for most DSE shares.' },
];

// One card per yearly measure: latest value, CAGR chip and a small line; missing years are skipped, not drawn as zero.
function TrendCards({ years, dividends, face }: { years: CompanyDetail['company']['years']; dividends: CompanyDetail['company']['dividends']; face: number }) {
  const colors = useChartColors();
  const series = trendSeries(years, dividends, face);
  return (
    <>
      <p className="muted small"><b>Audited yearly results</b> from DSE&apos;s company page (dse.com.bd). Revenue, cash flow and balance-sheet lines are not published there, so they are not shown.</p>
      <div className="trend-grid">
        {TRENDS.map((k) => {
          const pts = series[k.key], last = pts.at(-1), g = cagr(pts);
          return (
            <div key={k.key} className="panel kpi">
              <div className="small muted">{k.label}{last ? ` · ${last.year}` : ''}</div>
              <div className="trend-head"><span className="val mono">{last ? k.unit(last.value) : '—'}</span>
                {g ? <span className={`pill ${g.pct >= 0 ? 's-research' : 's-avoid'}`}>{signed(g.pct)} · {g.years}-year CAGR</span> : null}</div>
              <div className="mini">{colors && pts.length > 1 ? (
                <ChartBox height={70} label={`${k.label} by year: ` + pts.map((p) => `${p.year} ${k.unit(p.value)}`).join(', ')}>
                  <Line data={{ labels: pts.map((p) => p.year), datasets: [{ data: pts.map((p) => p.value), borderColor: colors['--accent'], backgroundColor: colors['--accent'] + '22', fill: true, pointRadius: 2, tension: 0.2 }] }}
                    options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => k.unit(ctx.parsed.y ?? 0) } } },
                      scales: { x: { display: false }, y: { display: false } } }} />
                </ChartBox>) : <span className="small muted">{pts.length ? 'One year of data only.' : 'No data on DSE.'}</span>}</div>
              <div className="why">{k.why}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function QuarterPanel({ interim, lastYearEps }: { interim: CompanyDetail['company']['interim']; lastYearEps: number | null }) {
  if (!interimIsFresh(interim)) return null;
  const row = interim?.eps as Record<string, unknown> | undefined;
  const rows = QUARTERS.filter(([k]) => typeof row?.[k] === 'number').map(([k, label, mult]) => ({ k, label, eps: row?.[k] as number, pace: (row?.[k] as number) * mult }));
  if (!rows.length) return null;
  const latest = rows.find((r) => r.k === 'nine') ?? rows.find((r) => r.k === 'half') ?? rows.find((r) => r.k === 'q1') ?? rows[0];
  const change = lastYearEps && lastYearEps > 0 ? ((latest.pace - lastYearEps) / lastYearEps) * 100 : null;
  return (
    <div className="panel" style={{ marginTop: 14 }}><h3>Latest quarterly results (unaudited)</h3>
      <div className="table-wrap"><table><thead><tr><th>Period</th><th className="n">EPS (৳)</th><th className="n">Full-year pace (৳)</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k}><td>{r.label}</td><td className={`n mono ${r.eps < 0 ? 'down' : ''}`}>{fmt(r.eps)}</td><td className="n mono">{fmt(r.pace)}</td></tr>)}</tbody></table></div>
      <p className="why">{latest.eps < 0 ? <b className="down">The latest period is a loss. </b> : null}
        Pace = {latest.label} EPS scaled to a full year{change != null ? <>; that is <span className={tone(change)}>{signed(change)}</span> against last full year&apos;s EPS ৳{fmt(lastYearEps)}</> : null}.
        A rough guide only: many businesses earn unevenly through the year.</p>
    </div>
  );
}

export function Financials({ s, years, dividends, face, interim, lastYearEps }: { s: Summary; years: CompanyDetail['company']['years']; dividends: CompanyDetail['company']['dividends']; face: number; interim: CompanyDetail['company']['interim']; lastYearEps: number | null }) {
  const colors = useChartColors();
  const missingEps = years.filter((y) => y.eps == null).map((y) => y.year);
  return (
    <>
      {s.years.length ? (
        <>
          <TrendCards years={years} dividends={dividends} face={face} />
          <div className="panel table-wrap" style={{ marginTop: 14 }}><h3>Year by year</h3>
            <table><thead><tr><th>Metric</th>{s.years.map((y) => <th key={y.year} className="n">{y.year}</th>)}</tr></thead>
              <tbody>{ROWS.map(([label, key, dp]) => (
                <tr key={key}><td>{label}</td>{s.years.map((y) => <td key={y.year} className="n mono">{fmt(y[key] as number | null, dp)}</td>)}</tr>
              ))}</tbody></table></div>
        </>
      ) : null}
      <div className="panel" style={{ marginTop: 14 }}><h3>Profit per share (EPS), all years on DSE</h3>
        {colors ? (
          <ChartBox label="EPS by year">
            <Bar data={{ labels: years.map((y) => y.year), datasets: [{ label: 'EPS', data: years.map((y) => y.eps), backgroundColor: years.map((y) => ((y.eps ?? 0) >= 0 ? colors['--up'] : colors['--down'])), borderRadius: 4 }] }}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => (ctx.parsed.y == null ? 'No data' : 'EPS ৳' + fmt(ctx.parsed.y)) } } } }} />
          </ChartBox>) : null}
        {missingEps.length ? <p className="why">No EPS on DSE for {missingEps.join(', ')}. A missing bar is missing data, not a loss.</p> : null}
      </div>
      <QuarterPanel interim={interim} lastYearEps={lastYearEps} />
    </>
  );
}
