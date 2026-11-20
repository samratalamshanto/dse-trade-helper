'use client';

import { useState, type ReactNode } from 'react';
import { Line } from 'react-chartjs-2';
import { ChartBox, useChartColors } from '@/components/charts';
import { ShareholdingDonut } from '@/components/company/SafetyOwners';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { fmt, moneyPerDay, sectorName, tone } from '@/components/format';
import { Icon, Info, Metric, type IconName } from '@/components/ui';
import type { CompanyDetail } from '@/lib/service';

type Company = CompanyDetail['company'];

const CRORE = 1e7;
const RANGES = [['1W', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 366]] as const;
type Range = (typeof RANGES)[number][0];
const TONE_ICON: Record<string, [IconName, string]> = { good: ['check', 't-good'], warn: ['info', 't-warn'], bad: ['cross', 't-bad'], neutral: ['neutral', 't-neutral'] };

const crore = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : '৳' + fmt(v / CRORE, d) + ' cr');
const taka = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : '৳' + fmt(v));
const peLatest = (c: Company) => (c.peLatest && typeof c.peLatest === 'object' ? c.peLatest as { audited?: number | null; unaudited?: number | null } : null);

// Only a plain domain or an http(s) address becomes a link; anything else is shown as text.
function websiteHref(raw: string | null | undefined): string | null {
  const v = (raw || '').trim();
  if (/^https?:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) return v;
  return /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v) ? 'https://' + v : null;
}

export function RangeBar52({ c, compact = false }: { c: Company; compact?: boolean }) {
  const lo = c.weekLow52, hi = c.weekHigh52, p = c.price;
  if (lo == null || hi == null || p == null || !(hi > lo)) return compact ? null : <p className="muted small"><Tr text="No 52-week range from DSE." /></p>;
  const at = Math.min(100, Math.max(0, ((p - lo) / (hi - lo)) * 100));
  return (
    <div className={compact ? 'range52 compact' : 'range52'}>
      {compact ? <div className="small muted"><Tr text="52-week range" /></div> : null}
      <div className="range neutral" role="img" aria-label={`52-week low ৳${fmt(lo)}, high ৳${fmt(hi)}, price ৳${fmt(p)}`}><i style={{ left: at + '%' }} /></div>
      <div className="range-labels mono"><span>৳{fmt(lo)}</span><span>৳{fmt(hi)}</span></div>
    </div>
  );
}

export function HeaderStats({ d }: { d: CompanyDetail }) {
  const c = d.company, m = d.analysis.metrics;
  return (
    <div className="hero-stats">
      <div><div className="small muted"><Tr text="Market cap" /></div><div className="mono">{crore(c.marketCap)}</div></div>
      <div><div className="small muted">P/E</div><div className="mono">{fmt(m.pe, 1)}</div></div>
      <div><div className="small muted">EPS</div><div className="mono">{taka(m.epsNow)}</div></div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fact"><div className="k"><Tr text={label} /></div><div className="v">{children}</div></div>;
}

function KeyFacts({ d }: { d: CompanyDetail }) {
  const c = d.company, m = d.analysis.metrics, pl = peLatest(c), href = websiteHref(c.website);
  const face = c.faceValue || 10;
  const shares = c.paidUpCapital != null ? c.paidUpCapital / face : null;
  return (
    <div className="panel"><h3><Tr text="Key facts" /></h3>
      <div className="facts">
        <Fact label="Sector">{c.sector ? sectorName(c.sector) : '—'}</Fact>
        <Fact label="Category">{c.category || '—'}</Fact>
        <Fact label="Listed">{c.listingYear ?? '—'}</Fact>
        <Fact label="NAV per share">{taka(c.nav)}</Fact>
        <Fact label="EPS (last year)">{taka(m.epsNow)}</Fact>
        <Fact label="P/E (audited)">{fmt(pl?.audited ?? m.pe, 1)}</Fact>
        <Fact label="P/E (latest results)">{fmt(pl?.unaudited, 1)}</Fact>
        <Fact label="12-month cash yield">{m.latestYield != null ? fmt(m.latestYield, 2) + '%' : '—'}</Fact>
        <Fact label="Shares outstanding">{shares != null ? fmt(shares / CRORE, 2) + ' cr' : '—'}</Fact>
        <Fact label="Paid-up capital">{crore(c.paidUpCapital)}</Fact>
        <Fact label="Market cap">{crore(c.marketCap)}</Fact>
        <Fact label="Website">{href ? <a href={href} target="_blank" rel="noopener noreferrer">{c.website} ↗</a> : (c.website || '—')}</Fact>
      </div>
    </div>
  );
}

function PriceChart({ c }: { c: Company }) {
  const colors = useChartColors();
  const { t } = useLang();
  const [range, setRange] = useState<Range>(() => (typeof window !== 'undefined' && matchMedia('(max-width: 640px)').matches ? '1M' : '1Y'));
  if (!c.series.length) return <p className="muted"><Tr text="No price history from DSE yet." /></p>;
  const days = RANGES.find(([k]) => k === range)?.[1] ?? 366;
  const from = new Date(Date.parse(c.series.at(-1)!.date + 'T00:00:00Z') - days * 86_400_000).toISOString().slice(0, 10);
  const pts = c.series.filter((x) => x.date >= from);
  const first = pts[0]?.price, last = pts.at(-1)?.price;
  const diff = first != null && last != null ? last - first : null;
  const pct = diff != null && first ? (diff / first) * 100 : null;
  const line = colors ? colors[(diff ?? 0) >= 0 ? '--up' : '--down'] : '';
  return (
    <>
      <div className="chart-head">
        <div role="group" aria-label={t('Price range')} className="range-btns">
          {RANGES.map(([k]) => <button key={k} type="button" className={`btn${k === range ? ' active' : ''}`} aria-pressed={k === range} onClick={() => setRange(k)}>{k}</button>)}
        </div>
        {diff != null ? <span className={`mono ${tone(diff)}`}>{diff >= 0 ? '+' : '−'}৳{fmt(Math.abs(diff))} ({diff >= 0 ? '+' : '−'}{fmt(Math.abs(pct ?? 0), 2)}%) <span className="small muted">{range}</span></span> : null}
      </div>
      {colors ? (
        <ChartBox label={`Daily closing price, ${range}`}>
          <Line data={{ labels: pts.map((x) => x.date), datasets: [{ label: 'Close', data: pts.map((x) => x.price), borderColor: line, backgroundColor: line + '22', fill: true, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: line, borderWidth: 2, tension: 0.2 }] }}
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => 'Close ৳' + fmt(ctx.parsed.y) } } }, scales: { x: { ticks: { maxTicksLimit: 6 } } } }} />
        </ChartBox>) : null}
    </>
  );
}

export function Overview({ d }: { d: CompanyDetail }) {
  const m = d.analysis.metrics, c = d.company, sp = c.sharePattern.at(-1);
  return (
    <>
      <KeyFacts d={d} />
      <div className="grid g4" style={{ marginTop: 14 }}>
        <Metric label="P/E" value={fmt(m.pe, 1)} hint="Price ÷ yearly profit per share. Lower can mean cheaper." />
        <Metric label="Sector P/E" value={fmt(d.sectorPe, 1)} hint="Median P/E of profitable companies in the same sector." />
        <Metric label="12-month cash yield" value={m.latestYield != null ? fmt(m.latestYield, 2) + '%' : '—'} hint={"Cash dividends of the last 12 months ÷ today's price. " + (m.yieldBasis || 'No cash dividend in the last 12 months.')} />
        <Metric label="Traded a day" value={moneyPerDay(m.avgDailyValue)} hint="Average value traded per day, last 20 days. Higher = easier to sell." />
      </div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Price" /> <Info text="Tap or hover the line to see the price on each day." /></h3><PriceChart c={c} /></div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="panel"><h3><Tr text="52-week range" /></h3><RangeBar52 c={c} />
          {c.weekHigh52 && c.price ? <p className="why">{fmt(((c.weekHigh52 - c.price) / c.weekHigh52) * 100, 1)}% <Tr text="below the 52-week high." /></p> : null}</div>
        <div className="panel"><h3><Tr text="Who owns the shares" /></h3><ShareholdingDonut sp={sp} height={200} />
          <p className="why"><Tr text="As on" /> {sp?.date || '—'}.</p></div>
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="panel"><h3><Tr text="Why this signal" /></h3>
          <ul className="reasons">{d.analysis.reasons.map((r, i) => { const [ic, cls] = TONE_ICON[r.tone] ?? TONE_ICON.neutral; return <li key={i}><Icon name={ic} className={cls} /><span>{r.text}</span></li>; })}</ul></div>
        <div className="panel"><h3><Tr text="What past data says" /></h3>
          <ul className="reasons">{d.analysis.history.length ? d.analysis.history.map((h, i) => <li key={i}><Icon name="trend" className="t-neutral" /><span>{h}</span></li>) : <li><Tr text="Not enough history." /></li>}</ul></div>
      </div>
    </>
  );
}
