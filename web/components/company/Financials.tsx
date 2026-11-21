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

const LABELS: Record<string, string> = {
  eps: 'EPS (৳)', epsBasic: 'EPS basic (৳)', epsBasicOriginal: 'EPS basic, original (৳)', epsBasicRestated: 'EPS basic, restated (৳)', epsDiluted: 'EPS diluted (৳)',
  epsContBasicOriginal: 'EPS continuing ops, basic original (৳)', epsContBasicRestated: 'EPS continuing ops, basic restated (৳)', epsContDiluted: 'EPS continuing ops, diluted (৳)',
  nav: 'NAV / share (৳)', navOriginal: 'NAV / share, original (৳)', navRestated: 'NAV / share, restated (৳)', navDiluted: 'NAV / share, diluted (৳)',
  pe: 'P/E', peBasicOriginal: 'P/E basic, original', peBasicRestated: 'P/E basic, restated', peDiluted: 'P/E diluted',
  peContBasicOriginal: 'P/E continuing ops, basic original', peContBasicRestated: 'P/E continuing ops, basic restated', peContDiluted: 'P/E continuing ops, diluted',
  profit: 'Net profit (৳ mn)', pco: 'Profit from continuing operations (৳ mn)', profitForYear: 'Profit for the year (৳ mn)', comprehensive: 'Total comprehensive income (৳ mn)',
  oci: 'Other comprehensive income (৳ mn)', reserve: 'Reserve (৳ mn)', dividend: 'Dividend (%)', dividendPct: 'Dividend (%)', dividendYield: 'Dividend yield (%)',
};
const INTERIM_COLS: [string, string][] = [['q1', '3 months (Q1)'], ['q2', 'Q2 alone'], ['half', '6 months'], ['q3', 'Q3 alone'], ['nine', '9 months'], ['annual', 'Full year']];
const cell = (v: unknown) => (typeof v === 'number' ? fmt(v) : v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const periodEnd = (v: unknown) => (typeof v === 'string' && /^\d{6}$/.test(v) ? new Date(Date.UTC(+v.slice(0, 4), +v.slice(4) - 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);

// Every yearly field DSE sends; a field empty in all years is left out.
function AllYears({ years: raw }: { years: CompanyDetail['company']['years'] }) {
  const years = Array.isArray(raw) ? raw : [];
  const keys = [...new Set(years.flatMap((y) => Object.keys(y)))].filter((k) => k !== 'year' && years.some((y) => y[k] != null && y[k] !== ''));
  if (!keys.length) return null;
  return (
    <div className="panel table-wrap" style={{ marginTop: 14 }}><h3>All yearly figures from DSE</h3>
      <table><thead><tr><th>Field</th>{years.map((y, i) => <th key={y.year + '-' + i} className="n">{y.year}</th>)}</tr></thead>
        <tbody>{keys.map((k) => <tr key={k}><td className={LABELS[k] ? '' : 'mono'}>{LABELS[k] ?? k}</td>{years.map((y, i) => <td key={y.year + '-' + i} className="n mono">{cell(y[k])}</td>)}</tr>)}</tbody></table>
      <p className="why">Original = as first published; restated = corrected later; diluted = counting shares that may be issued. Blank years are missing on DSE.</p></div>
  );
}

function InterimTable({ interim }: { interim: CompanyDetail['company']['interim'] }) {
  const rows = Array.isArray(interim?.rows) ? interim.rows : [];
  const cols = INTERIM_COLS.filter(([k]) => rows.some((r) => k in r));
  if (!rows.length || !cols.length) return null;
  return (
    <div className="panel table-wrap" style={{ marginTop: 14 }}><h3>All quarterly figures from DSE (unaudited)</h3>
      <table><thead><tr><th>Metric</th>{cols.map(([k, label]) => <th key={k} className="n">{label}{periodEnd(interim?.periods?.[k]) ? <div className="small muted">to {periodEnd(interim?.periods?.[k])}</div> : null}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.metric) + i}><td>{r.metric || '—'}</td>{cols.map(([k]) => <td key={k} className="n mono">{cell(r[k])}</td>)}</tr>)}</tbody></table></div>
  );
}

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
      <AllYears years={years} />
      <QuarterPanel interim={interim} lastYearEps={lastYearEps} />
      <InterimTable interim={interim} />
    </>
  );
}
