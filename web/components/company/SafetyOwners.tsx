'use client';

import { Doughnut, Line } from 'react-chartjs-2';
import { Tr } from '@/components/Tr';
import { ChartBox, useChartColors, type Colors } from '@/components/charts';
import { fmt } from '@/components/format';
import { FraudPill, Icon, Info, type FraudLevel } from '@/components/ui';
import type { CompanyDetail } from '@/lib/service';
import type { SharePattern } from '@/lib/types';

export function Safety({ a }: { a: CompanyDetail['analysis'] }) {
  const level = a.fraud.level as FraudLevel;
  return (
    <>
      <div className="panel"><h3>Warning signs <FraudPill level={level} /></h3>
        <p className="muted small"><Tr text="A flag is a pattern in public data, not an accusation against the company." /></p>
        {a.fraud.flags.length ? a.fraud.flags.map((f) => (
          <div key={f.title} className={`note ${level === 'high' ? 'bad' : 'warn'}`}><b><Tr text={f.title} />:</b> {f.detail}<div className="why">Why it matters: {f.why}</div></div>
        )) : <p className="muted">No warning pattern found: no price pump, no volume spike, no owner selling, no sudden profit jump, and results are up to date.</p>}
      </div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Quality checklist" /></h3>
        <ul className="reasons">{a.checks.map((x) => (
          <li key={x.label}>{x.ok ? <Icon name="check" className="t-good" /> : <Icon name="cross" className="t-bad" />}
            <span><span className="sr-only">{x.ok ? 'Passed: ' : 'Failed: '}</span><b><Tr text={x.label} /></b> — {x.detail}<div className="why">{x.why}</div></span></li>
        ))}</ul></div>
    </>
  );
}

const GROUPS = [['sponsor', 'Sponsors'], ['institution', 'Institutions'], ['foreign', 'Foreign'], ['government', 'Government'], ['public', 'Public']] as const;
const GROUP_COLORS: (keyof Colors)[] = ['--accent', '--up', '--warn', '--muted', '--down'];
// DSE reports loans in ৳ mn; shown in crore (÷10) like every other amount on the page.
const loanText = (v: number | null | undefined) => (v == null ? 'none reported' : '৳' + fmt(v / 10, 2) + ' cr');

// Latest shareholding split; shared by the Overview and Owners tabs.
export function ShareholdingDonut({ sp, height = 240 }: { sp: SharePattern | undefined; height?: number }) {
  const colors = useChartColors();
  if (!colors || !sp) return null;
  return (
    <ChartBox height={height} label={'Shareholding: ' + GROUPS.map(([k, l]) => `${l} ${fmt(sp[k] as number | null, 1)}%`).join(', ')}>
      <Doughnut data={{ labels: GROUPS.map(([k, l]) => `${l} ${fmt(sp[k] as number | null, 1)}%`), datasets: [{ data: GROUPS.map(([k]) => (sp[k] as number | null) || 0), backgroundColor: GROUP_COLORS.map((k) => colors[k]), borderColor: colors['--panel'], borderWidth: 2 }] }}
        options={{ maintainAspectRatio: false, cutout: '58%', interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (ctx) => ctx.label } } } }} />
    </ChartBox>
  );
}

export function Owners({ c }: { c: CompanyDetail['company'] }) {
  const colors = useChartColors();
  const sp = c.sharePattern.at(-1);
  const sponsors = c.sharePattern.map((x) => x.sponsor).filter((x): x is number => x != null);
  const trades = (c.events?.directorTrades || []).slice(0, 8);
  return (
    <>
      <div className="grid g2">
        <div className="panel"><h3>Who owns the shares now <Info text="Latest shareholding report on DSE. Hover a slice for its percentage." /></h3>
          <ShareholdingDonut sp={sp} />
          <p className="why">As on {sp?.date || '—'}. Sponsors are the owners and directors. BSEC requires them to hold at least 30% together.</p></div>
        <div className="panel"><h3><Tr text="Sponsor holding over time" /></h3>
          {colors && sponsors.length ? (
            <ChartBox label="Sponsor holding by report date">
              <Line data={{ labels: c.sharePattern.map((x) => (x.date || '').replace(' (year ended)', '')), datasets: [{ label: 'Sponsors', data: c.sharePattern.map((x) => x.sponsor), borderColor: colors['--accent'], backgroundColor: colors['--accent'], pointRadius: 4, tension: 0 }] }}
                options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => 'Sponsors ' + fmt(ctx.parsed.y, 2) + '%' } } },
                  scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } } }} />
            </ChartBox>) : null}
          <p className="why">A falling line means the owners are selling.</p></div>
      </div>
      <div className="panel table-wrap" style={{ marginTop: 14 }}><h3><Tr text="Shareholding reports" /></h3>
        <table><thead><tr><th>As on</th><th className="n">Sponsor</th><th className="n">Govt</th><th className="n">Institution</th><th className="n">Foreign</th><th className="n">Public</th></tr></thead>
          <tbody>{c.sharePattern.map((x) => (
            <tr key={x.date}><td>{x.date}</td>{(['sponsor', 'government', 'institution', 'foreign', 'public'] as const).map((k) => <td key={k} className="n mono">{fmt(x[k] as number | null, 1)}</td>)}</tr>
          ))}</tbody></table>
        <p className="why">If the sponsor % falls over time, the owners are selling. Loans: short-term {loanText(c.loanStatus?.shortTerm)}, long-term {loanText(c.loanStatus?.longTerm)}.</p></div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Director share trades" /></h3>
        {trades.length ? <ul className="reasons">{trades.map((x, i) => (
          <li key={i}>{x.side === 'sell' ? <Icon name="caution" className="t-warn" /> : <Icon name="check" className="t-good" />}
            <span><b>{x.side === 'sell' ? 'Plans to sell' : 'Plans to buy'}</b> — {x.who} · {x.date}</span></li>
        ))}</ul> : <p className="muted">No director buy or sell notices in DSE news.</p>}</div>
    </>
  );
}
