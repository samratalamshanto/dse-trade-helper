'use client';

import { useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { useApi } from '@/components/AppProvider';
import { useStoredValue } from '@/components/useStored';
import { ChangeText } from '@/components/CompanyCard';
import { ChartBox, useChartColors, type Colors } from '@/components/charts';
import { fmt, fmtDate, marketState } from '@/components/format';
import { ALLOCATION, futureValue, GROWTH_RATES, GROWTH_YEARS, INITIAL_CHOICES, MONTHLY_SPLIT, PLAN_COMPANIES, RESEARCH, type PlanCompany } from '@/components/plan/data';
import type { CompanyDetail, Dashboard } from '@/lib/service';
import { Tr } from '@/components/Tr';

const SECTIONS = [['start', 'First steps'], ['risks', 'Risks'], ['market', 'Market'], ['companies', 'Example companies'], ['ranking', 'Ranking'], ['portfolio', 'Example portfolio'], ['growth', 'Growth'], ['research', 'Research list']] as const;
const SECTION_OFFSET = 90;
const taka = (n: number) => '৳' + fmt(n, 0);

function useActiveSection(): string {
  const [active, setActive] = useState<string>(SECTIONS[0][0]);
  useEffect(() => {
    let queued = false;
    const update = () => {
      queued = false;
      const els = SECTIONS.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
      const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      const passed = els.filter((el) => el.getBoundingClientRect().top <= SECTION_OFFSET);
      setActive((atBottom ? els.at(-1) : passed.at(-1) || els[0])?.id || SECTIONS[0][0]);
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => removeEventListener('scroll', onScroll);
  }, []);
  return active;
}

function usePersistentFlag(key: string): [boolean, (v: boolean) => void] {
  const [v, set] = useStoredValue(key, '0');
  return [v === '1', (on) => set(on ? '1' : '0')];
}

function PlanCard({ p, colors }: { p: PlanCompany; colors: Colors | null }) {
  const { data: d } = useApi<CompanyDetail>('/api/company/' + encodeURIComponent(p.code));
  const [view, setView] = useState<'fin' | 'price'>('fin');
  const m = d?.analysis.metrics;
  const sets = Object.entries(p.series);
  const palette = colors ? [colors['--accent'], colors['--up'], colors['--warn']] : [];
  return (
    <div className="panel">
      <div className="co-head">
        <div><span className={`pill ${p.good ? 's-research' : 's-caution'}`}>{p.verdict}</span>
          <div className="co-name" style={{ marginTop: 8 }}>{p.name}</div><div className="co-sub mono">{p.code} · {p.sector} · DSE</div></div>
        <div style={{ textAlign: 'right' }}><div className="mono" style={{ fontSize: 28, fontWeight: 600 }}>{d ? '৳' + fmt(d.company.price) : '—'}</div>
          <div className="mono small">{d ? <ChangeText pct={d.company.changePct} suffix=" today" /> : null}</div></div>
      </div>
      <div className="grid g4" style={{ margin: '14px 0' }}>
        <div className="metric"><div className="k">P/E</div><div className="v mono">{m?.pe != null ? fmt(m.pe) + 'x' : '—'}</div></div>
        <div className="metric"><div className="k">EPS</div><div className="v mono">{m?.epsNow != null ? '৳' + fmt(m.epsNow) : '—'}</div></div>
        <div className="metric"><div className="k">NAV/share</div><div className="v mono">{d?.company.nav != null ? '৳' + fmt(d.company.nav) : '—'}</div></div>
        <div className="metric"><div className="k">Div. yield</div><div className="v mono">{m?.latestYield != null ? fmt(m.latestYield) + '%' : '—'}</div></div>
      </div>
      <div className="tabs" role="tablist" aria-label={`${p.code} charts`}>
        <button type="button" role="tab" aria-selected={view === 'fin'} onClick={() => setView('fin')}>Five-year figures</button>
        <button type="button" role="tab" aria-selected={view === 'price'} onClick={() => setView('price')}>Price (1 year)</button>
      </div>
      {colors && view === 'fin' ? (
        <ChartBox label={`${p.code} five-year figures`}>
          <Bar data={{ labels: p.periods, datasets: sets.map(([label, data], i) => ({ label, data, backgroundColor: palette[i], borderRadius: 4, yAxisID: i === 0 ? 'y' : 'y1' })) }}
            options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, y1: { display: sets.length > 1, position: 'right', beginAtZero: true, grid: { display: false } } } }} />
        </ChartBox>) : null}
      {colors && view === 'price' && d ? (
        <ChartBox label={`${p.code} price for the last year`}>
          <Line data={{ labels: d.company.series.map((x) => x.date), datasets: [{ data: d.company.series.map((x) => x.price), borderColor: colors['--accent'], pointRadius: 0, borderWidth: 2, tension: 0.2 }] }}
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => 'Close ৳' + fmt(ctx.parsed.y) } } }, scales: { x: { ticks: { maxTicksLimit: 6 } } } }} />
        </ChartBox>) : null}
      <p><b>Why:</b> {p.why}</p>
      <div className="note">{p.positive}</div>
      <div className="note warn">{p.warning}</div>
      <p><b>Verdict:</b> {p.final} <a href={p.link} target="_blank" rel="noopener noreferrer">Source ↗</a></p>
    </div>
  );
}

export default function PlanPage() {
  const colors = useChartColors();
  const active = useActiveSection();
  const { data: dash } = useApi<Dashboard>('/api/dashboard');
  const [initial, setInitial] = useState(30000);
  const [monthly, setMonthly] = useState(5000);
  const [hasBo, setHasBo] = usePersistentFlag('bo-account');
  const dsex = dash?.index.find((x) => x.key === 'DSEX');
  const labels = ['Start', ...Array.from({ length: GROWTH_YEARS }, (_, i) => 'Year ' + (i + 1))];
  const invested = futureValue(initial, monthly, 0, GROWTH_YEARS * 12);
  const growthColors: (keyof Colors)[] = ['--muted', '--warn', '--accent', '--up'];

  return (
    <>
      <h1><Tr text="Start investing" /></h1>
      <p className="muted">First steps for a new investor: open a BO account, pick a broker, start small, and learn the risks.
        Further down is an <b>example</b> long-term plan with four well-known companies, to show how a plan can look.</p>
      <nav className="section-tabs" aria-label="Sections on this page">
        {SECTIONS.map(([id, label]) => <a key={id} href={'#' + id} aria-current={active === id ? 'true' : undefined}>{label}</a>)}
      </nav>

      <h2 id="start">First steps</h2>
      <div className="panel"><ol className="steps">
        <li><b>Open a BO account</b> through a licensed DSE broker or authorised participant.</li>
        <li><b>Choose a brokerage firm.</b> Compare fees, support, online trading and withdrawals.</li>
        <li><b>Deposit a small amount</b> that you can leave invested.</li>
        <li><b>Research before you buy:</b> latest financial statements, disclosures and valuation.</li>
        <li><b>Keep an investment journal:</b> price, quantity, reason, holding period and risks.</li></ol>
        <div className="check"><input type="checkbox" id="bo-account" checked={hasBo} onChange={(e) => setHasBo(e.target.checked)} /><label htmlFor="bo-account">I have a BO account</label></div></div>

      <h2 id="risks">Important risks before investing</h2>
      <div className="grid g2">
        {[['1. Banking sector', 'Check classified loans, rescheduled loans, provisions and capital adequacy. Rising profit alone is not enough.'],
          ['2. Corporate governance', 'Check sponsor and director holdings, related-party transactions and auditor qualifications.'],
          ['3. Liquidity', 'Some shares are hard to sell at a fair price.'], ['4. Dividend traps', 'A high dividend yield does not guarantee future dividends.'],
          ['5. Price manipulation', 'Do not buy on Facebook groups, rumours or broker tips.'], ['6. Diversification', 'Do not put your emergency savings in shares.']].map(([t, d]) => (
          <div key={t} className="panel"><b>{t}</b><p className="small muted">{d}</p></div>))}
      </div>
      <div className="note bad">Keep your emergency fund separate. A 3–5 year horizon is short for shares. Do not invest money that you must take out on a fixed date.</div>

      <h2>Example plan</h2>
      <div className="note warn" role="note"><b>Example plan, not advice.</b> The companies, split and amounts below are one person&apos;s worked example from public reports.
        They are not a recommendation to buy. Do your own research, and check the live signal on each company page.</div>
      <section id="market">
        <div className="grid g4">
          <div className="panel stat"><div className="k">DSEX {dash ? (dash.live && marketState(dash.session).key === 'open' ? '(live)' : `(close ${fmtDate(dash.session?.sessionDate || dash.showingDate)})`) : ''}</div><div className="v mono">{fmt(dsex?.value)}</div>
            <div className="small mono">{dsex?.change == null ? 'change shows after the open' : `${dsex.change >= 0 ? '+' : ''}${fmt(dsex.change)} (${fmt(dsex.percent)}%)`}</div></div>
          <div className="panel stat"><div className="k">Market breadth</div><div className="v mono">{dash ? `${dash.breadth.advanced} / ${dash.breadth.declined} / ${dash.breadth.unchanged}` : '—'}</div>
            <div className="small">{dash?.live ? '' : 'last session: '}advanced / declined / unchanged</div></div>
          <div className="panel stat"><div className="k">FY2025–26 DSEX</div><div className="v mono up">+19%</div><div className="small">The Business Standard</div></div>
          <div className="panel stat"><div className="k">Market cap, Aug 2026</div><div className="v mono">৳6.95 tn</div><div className="small down">−4.58% year on year</div></div>
        </div>
        <div className="note">The market recovered strongly in FY26. The later fall in market cap shows why you should not invest all your money at once.
          <b> Approach: invest in stages over 3–6 months, based on valuation and financial results.</b></div>
      </section>

      <h2 id="companies">Example companies: five-year analysis</h2>
      <div className="grid">{PLAN_COMPANIES.map((p) => <PlanCard key={p.code} p={p} colors={colors} />)}</div>

      <h2 id="ranking">Overall comparison and ranking</h2>
      <div className="panel table-wrap"><table>
        <thead><tr><th>Company</th><th>Earnings trend</th><th>Assessment</th></tr></thead>
        <tbody>{PLAN_COMPANIES.map((p) => <tr key={p.code}><td><b className="mono">{p.code}</b><div className="small">{p.name}</div></td><td>{p.trend}</td>
          <td><span className={`pill ${p.good ? 's-research' : 's-caution'}`}>{p.verdict}</span></td></tr>)}</tbody>
      </table><p className="small muted">These are first fundamental checks, not full buy ratings. Check the latest quarterly cash flows, loan quality, regulatory disclosures and management risks before a final decision.</p></div>

      <h2 id="portfolio">Example portfolio split</h2>
      <div className="grid g2">
        <div className="panel">
          <div className="grid g2">
            <label className="field">Initial investment (৳)
              <select value={initial} onChange={(e) => setInitial(Number(e.target.value))}>{INITIAL_CHOICES.map((v) => <option key={v} value={v}>{fmt(v, 0)}</option>)}</select></label>
            <label className="field">Monthly contribution (৳)
              <input type="number" min={0} step={500} value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} /></label>
          </div>
          <div className="alloc-bar">{ALLOCATION.map((a) => <div key={a.label} style={{ width: `${a.pct}%`, background: `var(${a.color})` }} title={a.label} />)}</div>
          <div className="table-wrap"><table>
            <thead><tr><th>Holding</th><th className="n">Share</th><th className="n">Amount</th><th className="n">Shares at today&apos;s price</th></tr></thead>
            <tbody>{ALLOCATION.map((a) => {
              const amt = (initial * a.pct) / 100;
              return <tr key={a.label}><td><b>{a.label}</b><div className="small muted">{a.note}</div></td><td className="n mono">{a.pct}%</td><td className="n mono">{taka(amt)}</td>
                <td className="n mono">{a.code ? <SharesAtPrice code={a.code} amount={amt} /> : '—'}</td></tr>;
            })}</tbody></table></div>
          <p className="small muted">&quot;Shares at today&apos;s price&quot; is the whole shares you can buy, before brokerage fees.</p>
        </div>
        <div className="panel"><b>Monthly plan</b>
          <table><tbody>{MONTHLY_SPLIT.map(([k, f]) => <tr key={k}><td>{k}</td><td className="n mono">{taka(monthly * f)}</td></tr>)}
            <tr><td><b>Total</b></td><td className="n mono"><b>{taka(monthly)}</b></td></tr></tbody></table>
          <div className="note warn">Do not force a purchase every month. If the price is above your valuation range, keep the cash and wait.</div></div>
      </div>

      <h2 id="growth">What could your investment become?</h2>
      <div className="panel">
        {colors ? (
          <ChartBox height={300} label="Value of the plan after each year at 0, 4, 8 and 12 percent a year">
            <Line data={{ labels, datasets: GROWTH_RATES.map((r, i) => ({ label: r === 0 ? 'Money invested' : `${r}% a year`, borderColor: colors[growthColors[i]], backgroundColor: colors[growthColors[i]],
              borderDash: r === 0 ? [6, 4] : [], pointRadius: 3, tension: 0.25, data: labels.map((_, y) => Math.round(futureValue(initial, monthly, r, y * 12))) })) }}
              options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${taka(ctx.parsed.y ?? 0)}` } } },
                scales: { y: { ticks: { callback: (v) => '৳' + Number(v) / 1000 + 'K' } } } }} />
          </ChartBox>) : null}
        <div className="table-wrap"><table><thead><tr><th>Scenario</th><th className="n">Value after 5 years</th><th className="n">Gain over money invested</th></tr></thead>
          <tbody>{GROWTH_RATES.map((r) => { const v = futureValue(initial, monthly, r, GROWTH_YEARS * 12);
            return <tr key={r}><td>{r === 0 ? 'No return' : r + '% annual return'}</td><td className="n mono">{taka(v)}</td><td className="n mono">{taka(v - invested)}</td></tr>; })}</tbody></table></div>
        <p className="small muted">Start with {taka(initial)}, add {taka(monthly)} at the end of each month, returns compounded monthly. These figures leave out tax, brokerage fees and inflation. Returns are examples, not forecasts. DSE returns can be negative.</p>
      </div>

      <h2 id="research">Next research phase</h2>
      <div className="panel"><p className="small muted">For each company: five years of audited financials, quarterly results, dividends, price history, valuation, ownership and disclosures. Compare companies inside the same industry.</p>
        <div className="grid g2">{RESEARCH.map((code) => <ResearchItem key={code} code={code} />)}</div></div>
    </>
  );
}

function SharesAtPrice({ code, amount }: { code: string; amount: number }) {
  const { data } = useApi<CompanyDetail>('/api/company/' + encodeURIComponent(code));
  const price = data?.company.price;
  return <>{price && price > 0 ? `${Math.floor(amount / price)} × ৳${fmt(price)}` : '—'}</>;
}

function ResearchItem({ code }: { code: string }) {
  const [done, setDone] = usePersistentFlag('research-' + code);
  return <div className="check"><input type="checkbox" id={'r-' + code} checked={done} onChange={(e) => setDone(e.target.checked)} /><label htmlFor={'r-' + code} className="mono">{code}</label></div>;
}
