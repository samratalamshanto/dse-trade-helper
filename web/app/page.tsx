'use client';

import Link from 'next/link';
import { useCallback, useState, type ReactNode } from 'react';
import { useStoredValue } from '@/components/useStored';
import { useLang } from '@/components/i18n';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useRouter } from 'next/navigation';
import { useApi } from '@/components/AppProvider';
import { ChartBox, dateTicks, useChartColors } from '@/components/charts';
import { CompanyCard } from '@/components/CompanyCard';
import { isTooLate, LastBuy } from '@/components/LastBuy';
import { HoldingsToday } from '@/components/HoldingsToday';
import { MyStocks } from '@/components/MyStocks';
import { PlansMini, TodaysPicks } from '@/components/planner/DashboardCards';
import { Tr } from '@/components/Tr';
import { fmt, fmtDate, marketState, pctNum, sectorName, signed, tone } from '@/components/format';
import { FraudPill, Icon, Info, SIGNALS, Skeleton, type FraudLevel, type IconName, type Signal } from '@/components/ui';
import type { Dashboard } from '@/lib/service';

const SIGNAL_COLORS: Record<Signal, '--up' | '--muted' | '--warn' | '--down'> = { research: '--up', neutral: '--muted', caution: '--warn', avoid: '--down' };
const KEYS = Object.keys(SIGNALS) as Signal[];

function TodayItem({ icon, title, count, href, children }: { icon: IconName; title: string; count: number; href: string; children: ReactNode[] }) {
  return (
    <div className="today-item">
      <div className="today-head"><Icon name={icon} /><b><Tr text={title} /></b><span className="pill s-neutral mono">{count}</span><Link href={href} className="small open-link"><Tr text="Open →" /></Link></div>
      {children.length ? <ul className="today-list">{children}</ul> : <p className="small muted"><Tr text="Nothing today." /></p>}
    </div>
  );
}

const Row = ({ code, children }: { code: string; children: ReactNode }) => (
  <li><Link href={'/c/' + encodeURIComponent(code)} className="mono">{code}</Link><span>{children}</span></li>
);

function StartGuide() {
  const [hidden, setHidden] = useStoredValue('startHidden', '0');
  if (hidden === '1') return null;
  return (
    <section className="panel start" aria-label="Start here">
      <div><b>New here? Start in 3 steps.</b>
        <ol>
          <li><Link className="link-btn" href="/learn">Read &quot;How it works&quot;</Link> (2 minutes): what the signals and words mean.</li>
          <li><Link className="link-btn" href="/all?signal=research">Open the shortlist</Link>: companies that pass every check.</li>
          <li>Open one company and read its <b>four answers</b> at the top. Then check its Dividends tab.</li>
        </ol>
        <p className="small muted">This site helps you choose what to research. It does not tell you what to buy.</p></div>
      <button className="btn primary" type="button" onClick={() => setHidden('1')}>Got it</button>
    </section>
  );
}

function TrustCard() {
  const [hidden, setHidden] = useStoredValue('trustHidden', '0');
  if (hidden === '1') return null;
  return (
    <section className="panel start trust" aria-labelledby="trust-title">
      <div><h2 className="h3" id="trust-title"><Icon name="info" /> <Tr text="Can I trust these numbers?" /></h2>
      <ul className="small">
        <li><b><Tr text="Source:" /></b> <Tr text="the public Dhaka Stock Exchange website (dse.com.bd): prices, company pages and news." /></li>
        <li><b><Tr text="Updates:" /></b> <Tr text="prices every minute while the market is open; company figures about once a day." /></li>
        <li><b><Tr text="What it is:" /></b> <Tr text="a free learning tool. Signals come from fixed rules you can read on How it works. It is not investment advice." /></li>
        <li><b><Tr text="Who made it:" /></b> <Tr text="an independent developer. It is not linked to DSE, BSEC or any broker, and it does not sell shares." /></li>
      </ul></div>
      <button className="btn primary" type="button" onClick={() => setHidden('1')}><Tr text="Got it" /></button>
    </section>
  );
}

function MarketCharts({ d, liveNow }: { d: Dashboard; liveNow: boolean }) {
  const colors = useChartColors();
  const router = useRouter();
  if (!colors) return null;
  return (
    <>
      <h2>Market in pictures</h2>
      <div className="grid g3">
        <div className="panel"><h3>{d.companyCount} companies by signal <Info text="Every DSE company, sorted by our rules. Click a slice to see that list." /></h3>
          <ChartBox label={KEYS.map((k) => `${SIGNALS[k].label} ${d.counts[k]}`).join(', ')}>
            <Doughnut data={{ labels: KEYS.map((k) => SIGNALS[k].label), datasets: [{ data: KEYS.map((k) => d.counts[k]), backgroundColor: KEYS.map((k) => colors[SIGNAL_COLORS[k]]), borderColor: colors['--panel'], borderWidth: 2 }] }}
              options={{ maintainAspectRatio: false, cutout: '58%', interaction: { mode: 'nearest', intersect: true },
                onClick: (_e, els) => { if (els[0]) router.push('/all?signal=' + KEYS[els[0].index]); },
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed} companies` } } } }} />
          </ChartBox></div>
        <div className="panel"><h3>{liveNow ? 'Sectors today' : 'Sectors, last session'} <Info text="Average price change of the companies in each sector." /></h3>
          <ChartBox height={Math.max(240, d.sectors.length * 18)} label="Average price change by sector">
            <Bar data={{ labels: d.sectors.map((s) => sectorName(s.sector)), datasets: [{ data: d.sectors.map((s) => s.avg), backgroundColor: d.sectors.map((s) => colors[s.avg >= 0 ? '--up' : '--down']), borderRadius: 3 }] }}
              options={{ indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => `${signed(ctx.parsed.x, 2)} average · ${d.sectors[ctx.dataIndex].n} companies` } } },
                scales: { x: { ticks: { callback: (v) => v + '%' } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } }} />
          </ChartBox></div>
        <div className="panel"><h3>Turnover, last 10 days <Info text="Value of shares traded each day, in crore taka." /></h3>
          <ChartBox label="Daily turnover for the last 10 sessions">
            <Bar data={{ labels: d.daily.map((x) => x.date), datasets: [{ data: d.daily.map((x) => x.turnover / 10), backgroundColor: colors['--accent'], borderRadius: 3 }] }}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: {
                title: (items) => d.daily[items[0].dataIndex].date,
                label: (ctx) => `৳${fmt(ctx.parsed.y, 0)} crore · ${d.daily[ctx.dataIndex].advanced} up / ${d.daily[ctx.dataIndex].declined} down` } } },
                scales: { x: { ticks: { ...dateTicks, maxRotation: 0 } } } }} />
          </ChartBox></div>
      </div>
    </>
  );
}

function DsexLine({ d }: { d: Dashboard }) {
  const colors = useChartColors();
  const dsex = d.index.find((x) => x.key === 'DSEX');
  if (!d.intraday.length) return <div className="chart-empty">The DSEX line through the day appears after trading starts at 10:00.</div>;
  if (!colors) return null;
  return (
    <ChartBox height={160} label={`DSEX through the day, ${fmtDate(d.intradayDay)}`}>
      <Line data={{ labels: d.intraday.map((p) => p.t), datasets: [{ data: d.intraday.map((p) => p.value), borderColor: colors[(dsex?.change ?? 0) >= 0 ? '--up' : '--down'], pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, tension: 0.2 }] }}
        options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => 'DSEX ' + fmt(ctx.parsed.y) } } }, scales: { x: { ticks: { maxTicksLimit: 8 } } } }} />
    </ChartBox>
  );
}

export default function DashboardPage() {
  const { t } = useLang();
  const { data: d, error } = useApi<Dashboard>('/api/dashboard');
  const [held, setHeld] = useState<string[]>([]);
  const onHeld = useCallback((codes: string[]) => setHeld(codes), []);
  if (error && !d) return <div className="note bad">Could not load the dashboard: {error}. Try Refresh in a minute.</div>;
  if (!d) return <><h1 className="sr-title">{t('DSE dashboard')}</h1><Skeleton label="Loading dashboard" rows={7} /></>;

  const dsex = d.index.find((x) => x.key === 'DSEX');
  const b = d.breadth, traded = (b.advanced || 0) + (b.declined || 0) + (b.unchanged || 0);
  const notTraded = Math.max(0, d.companyCount - traded), total = traded + notTraded || 1;
  const turnoverChange = d.previous?.turnover ? ((d.totals.turnover - d.previous.turnover) / d.previous.turnover) * 100 : null;
  const state = marketState(d.session);
  // After the close DSE still reports today's trades; "today" wording is only for an open market.
  const liveNow = d.live && state.key === 'open';
  const today = d.today;
  const buyable = d.recordSoon.filter((r) => !isTooLate(r, today))
    .sort((x, y) => Number(x.fraud !== 'clean') - Number(y.fraud !== 'clean') || (x.lastBuyDate || '').localeCompare(y.lastBuyDate || ''));

  return (
    <>
      <h1 className="sr-title">{t('DSE dashboard')}</h1>
      <StartGuide />
      <TrustCard />
      <section className="panel market" aria-label={t('Market')}>
        {d.live ? null : <p className="small muted session-note">{t('Showing the last session')}, <b>{fmtDate(d.showingDate)}</b>. {t("Today's figures appear when trading starts.")}</p>}
        <div className="market-top">
          <div><div className="small muted">{t('DSEX index')} <Info text="The main index of the Dhaka Stock Exchange." /></div>
            <div className="big-num mono">{fmt(dsex?.value)}</div>
            <div className={`mono ${tone(dsex?.change)}`}>{dsex?.change == null ? t('change not available') : `${dsex.change >= 0 ? '+' : ''}${fmt(dsex.change)} (${signed(dsex.percent, 2)})`}</div></div>
          <div className="market-stats">
            <div><div className="small muted">{t('Turnover')}</div><div className="mono stat">৳{fmt(d.totals.turnover / 10, 0)} cr</div>
              <div className={`small ${tone(turnoverChange)}`}>{turnoverChange == null ? '' : signed(turnoverChange) + ' ' + t('vs day before')}</div></div>
            <div><div className="small muted">{t('Trades')}</div><div className="mono stat">{fmt(d.totals.trades, 0)}</div></div>
            <div><div className="small muted">{t('Market now')}</div><div className="stat"><span className={`pill ${state.key === 'open' ? 's-research' : 's-neutral'}`}>{t(state.short.replace('● ', ''))}</span></div>
              <div className="small muted">{t('figures')}: {fmtDate(d.showingDate)}</div></div>
          </div>
        </div>
        <DsexLine d={d} />
        <div className="breadth" role="img" aria-label={`${b.advanced} up, ${b.declined} down, ${b.unchanged} unchanged, ${notTraded} not traded, of ${d.companyCount} companies`}>
          <i style={{ width: `${(b.advanced / total) * 100}%`, background: 'var(--up)' }} />
          <i style={{ width: `${(b.unchanged / total) * 100}%`, background: 'var(--muted)' }} />
          <i style={{ width: `${(b.declined / total) * 100}%`, background: 'var(--down)' }} />
          <i style={{ width: `${(notTraded / total) * 100}%`, background: 'var(--panel-2)' }} />
        </div>
        <div className="small breadth-labels"><span className="up">{b.advanced} {t('up')}</span><span className="muted">{b.unchanged} {t('unchanged')}</span><span className="down">{b.declined} {t('down')}</span>
          {notTraded ? <span className="muted">+ {notTraded} {t('not traded')}</span> : null}</div>
      </section>
      <HoldingsToday onHeld={onHeld} />
      <MyStocks exclude={held} />
      <PlansMini />

      <div className="grid g4 quick">
        <Link className="panel card quick-card" href="/all?signal=research"><Icon name="star" /><div><div className="small muted">{t('Shortlist')}</div><div className="stat mono">{d.counts.research}</div><div className="small muted">{t('pass every check')}</div></div></Link>
        <Link className="panel card quick-card" href="/dividends"><Icon name="calendar" /><div><div className="small muted">{t('Dividends coming')}</div><div className="stat mono">{d.upcomingCount}</div><div className="small muted">{t('upcoming record dates')}</div></div></Link>
        <Link className="panel card quick-card" href="/warning-signs"><Icon name="high" /><div><div className="small muted">{t('Warning signs')}</div><div className="stat mono">{d.fraudCount}</div><div className="small muted">{t('companies with warnings')}</div></div></Link>
        <Link className="panel card quick-card" href="/learn"><Icon name="help" /><div><div className="small muted">{t('New here?')}</div><div className="stat">{t('How it works')}</div><div className="small muted">{t('signals in plain words')}</div></div></Link>
      </div>

      <h2>{t(liveNow ? "Today's important things" : 'Important things from the last session')}</h2>
      <div className="grid g3">
        <TodayItem icon="calendar" title="Dividends you can still buy for (record date within 7 days)" count={buyable.length} href="/dividends">
          {buyable.slice(0, 5).map((r) => <Row key={r.code} code={r.code}>{pctNum(r.cashPct)}% · {t('buy by')} <LastBuy r={r} />{r.fraud !== 'clean' ? <> <FraudPill level={r.fraud as FraudLevel} /></> : null}</Row>)}
        </TodayItem>
        <TodayItem icon="research" title="Dividends declared this week" count={d.declaredThisWeek.length} href="/dividends">
          {d.declaredThisWeek.slice(0, 5).map((r) => <Row key={r.code} code={r.code}>{pctNum(r.cashPct)}%{r.stockPct ? ` + ${pctNum(r.stockPct)}% bonus` : ''} · {fmtDate(r.announced)}{r.fraud !== 'clean' ? <> <FraudPill level={r.fraud as FraudLevel} /></> : null}</Row>)}
        </TodayItem>
        <TodayItem icon="caution" title="Unusual trading volume" count={d.unusualCount} href="/warning-signs">
          {d.unusual.map((u) => <Row key={u.code} code={u.code}>{fmt(u.x, 1)}× normal volume</Row>)}
        </TodayItem>
        <TodayItem icon="trend" title={liveNow ? 'Top gainers today' : "Last session's top gainers"} count={d.gainers.length} href="/all">
          {d.gainers.map((g) => <Row key={g.code} code={g.code}><span className="up mono">{signed(g.percent, 2)}</span> · ৳{fmt(g.price)}</Row>)}
        </TodayItem>
        <TodayItem icon="avoid" title={liveNow ? 'Top losers today' : "Last session's top losers"} count={d.losers.length} href="/all">
          {d.losers.map((g) => <Row key={g.code} code={g.code}><span className="down mono">{signed(g.percent, 2)}</span> · ৳{fmt(g.price)}</Row>)}
        </TodayItem>
        <TodayItem icon="high" title="Warning signs (outside category Z)" count={d.fraudCount} href="/warning-signs">
          {d.fraudTop.map((f) => <Row key={f.code} code={f.code}><span className="small">{f.flags.join(', ')}</span></Row>)}
        </TodayItem>
      </div>

      <TodaysPicks />
      <MarketCharts d={d} liveNow={liveNow} />

      <h2>{t('Top of the shortlist')}</h2>
      <p className="muted small">{t('Companies that pass every research check, best score first. A place to start research, not a buy order.')}</p>
      <div className="grid g3">{d.shortlist.length ? d.shortlist.map((r) => <CompanyCard key={r.code} r={r} />) : <div className="empty panel">No company has passed yet.</div>}</div>
      <p><Link href="/all?signal=research">{t('See the whole shortlist →')}</Link></p>
    </>
  );
}
