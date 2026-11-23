'use client';

import { useState, type ReactNode } from 'react';
import { Line } from 'react-chartjs-2';
import { ChartBox, dateTicks, useChartColors } from '@/components/charts';
import { ShareholdingDonut } from '@/components/company/SafetyOwners';
import { BuyPlanner, SellEase } from '@/components/planner/BuyPlanner';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { fmt, moneyPerDay, sectorName, signed, tone } from '@/components/format';
import { Icon, Info, type IconName } from '@/components/ui';
import { sellEase } from '@/lib/buy-planner';
import { oneYearChange } from '@/lib/price-history';
import type { CompanyDetail } from '@/lib/service';

type Company = CompanyDetail['company'];

const CRORE = 1e7;
const LAKH = 1e5;
const RANGES = [['1W', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365]] as const;
type Range = (typeof RANGES)[number][0];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// Plain-language tooltips shared by the Overview and Company details tabs.
export const HINTS = {
  freeFloat: 'Free float: the share of all shares that ordinary investors can trade. Shares held by sponsors and the government are not counted.',
  freeFloatCap: 'Free-float market cap: price × the shares that are free to trade. It shows how much of the company the market can really buy.',
  peAudited: "DSE's audited P/E: price ÷ EPS of the last audited (checked) full year in DSE's own table.",
  peUnaudited: "DSE's P/E from latest results: price ÷ EPS from the newest quarterly results. These are not yet audited, so they can change.",
};
const TONE_ICON: Record<string, [IconName, string]> = { good: ['check', 't-good'], warn: ['info', 't-warn'], bad: ['cross', 't-bad'], neutral: ['neutral', 't-neutral'] };

export const crore = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : '৳' + fmt(v / CRORE, d) + ' cr');
export const taka = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : '৳' + fmt(v));
// Marker centre stays 9px (its radius) inside the track, so it is never cut off at 0% or 100%.
export const markerLeft = (pct: number) => `clamp(9px, ${pct}%, calc(100% - 9px))`;
const peLatest = (c: Company) => (c.peLatest && typeof c.peLatest === 'object' ? c.peLatest as { audited?: number | null; unaudited?: number | null } : null);

// Only a plain domain or an http(s) address becomes a link; anything else is shown as text.
export function websiteHref(raw: string | null | undefined): string | null {
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
      <div className="range neutral" role="img" aria-label={`52-week low ৳${fmt(lo)}, high ৳${fmt(hi)}, price ৳${fmt(p)}`}><i style={{ left: markerLeft(at) }} /></div>
      <div className="range-labels mono"><span>৳{fmt(lo)}</span><span>৳{fmt(hi)}</span></div>
    </div>
  );
}

export function HeaderStats({ d }: { d: CompanyDetail }) {
  const c = d.company, m = d.analysis.metrics;
  return (
    <div className="hero-stats">
      <div><div className="small muted"><Tr text="Market cap" /></div><div className="mono">{crore(c.marketCap)}</div></div>
      <div><div className="small muted"><Tr text="P/E" /> <Info text="Price to earnings: how many taka you pay for ৳1 of yearly profit. Lower can mean cheaper." /></div><div className="mono">{fmt(m.pe, 1)}</div></div>
      <div><div className="small muted"><Tr text="EPS" /> <Info text="Earnings per share: the company's yearly profit for each share." /></div><div className="mono">{taka(m.epsNow)}</div></div>
    </div>
  );
}

export function Fact({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="fact"><div className="k"><Tr text={label} />{hint ? <> <Info text={hint} /></> : null}</div><div className="v">{children}</div></div>;
}

function KeyFacts({ d }: { d: CompanyDetail }) {
  const c = d.company, m = d.analysis.metrics, pl = peLatest(c), href = websiteHref(c.website);
  const face = c.faceValue || 10, det = c.details ?? {};
  const shares = c.paidUpCapital != null ? c.paidUpCapital / face : null;
  return (
    <div className="panel"><h3><Tr text="Key facts" /></h3>
      <div className="facts">
        <Fact label="Sector">{c.sector ? sectorName(c.sector) : '—'}</Fact>
        <Fact label="Category">{c.category || '—'}</Fact>
        <Fact label="Listed">{c.listingYear ?? '—'}</Fact>
        <Fact label="NAV per share">{taka(c.nav)}</Fact>
        <Fact label="EPS (last year)">{taka(m.epsNow)}</Fact>
        <Fact label="P/E (used by the signal)" hint={`Price ÷ EPS of ${m.peBasis ?? 'the last year'}. The signal, the checks, the Valuation verdict and the company lists use this P/E.`}>{fmt(m.pe, 1)}</Fact>
        <Fact label="DSE P/E (audited)" hint={HINTS.peAudited}>{fmt(pl?.audited, 1)}</Fact>
        <Fact label="DSE P/E (latest results)" hint={HINTS.peUnaudited}>{fmt(pl?.unaudited, 1)}</Fact>
        <Fact label="12-month cash yield" hint={"Cash dividends of the last 12 months ÷ today's price. " + (m.yieldBasis || 'No cash dividend in the last 12 months.') + (m.yieldNote ? ' ' + m.yieldNote + '.' : '')}>{m.latestYield != null ? fmt(m.latestYield, 2) + '%' : '—'}</Fact>
        <Fact label="Shares outstanding">{shares != null ? fmt(shares / CRORE, 2) + ' cr' : '—'}</Fact>
        <Fact label="Paid-up capital">{crore(c.paidUpCapital)}</Fact>
        <Fact label="Market cap">{crore(c.marketCap)}</Fact>
        <Fact label="Free float" hint={HINTS.freeFloat}>{num(det.freeFloat) != null ? fmt(num(det.freeFloat), 2) + '%' : '—'}</Fact>
        <Fact label="Free-float market cap" hint={HINTS.freeFloatCap}>{crore(num(det.freeFloatMarketCap), 1)}</Fact>
        <Fact label="Sector P/E" hint="Median P/E of profitable companies in the same sector. Compare it with this company's P/E above.">{fmt(d.sectorPe, 1)}</Fact>
        <Fact label="Traded a day" hint="Average value traded per day, last 20 days. Higher = easier to sell.">{moneyPerDay(m.avgDailyValue)}</Fact>
        <Fact label="How easy to sell"><SellEase what="৳1 lakh" ease={sellEase(LAKH, m.avgDailyValue)} /></Fact>
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
  const days = RANGES.find(([k]) => k === range)?.[1] ?? 365;
  const from = new Date(Date.parse(c.series.at(-1)!.date + 'T00:00:00Z') - days * 86_400_000).toISOString().slice(0, 10);
  const pts = c.series.filter((x) => x.date >= from);
  // 1Y is the one 1-year change the lists and Price history show.
  const year = range === '1Y' ? oneYearChange(c.series, c.price) : null;
  const first = year ? year.yearAgo.price : pts[0]?.price, last = year ? c.price : pts.at(-1)?.price;
  const diff = range === '1Y' && !year ? null : first != null && last != null ? last - first : null;
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
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => 'Close ৳' + fmt(ctx.parsed.y) } } }, scales: { x: { ticks: dateTicks } } }} />
        </ChartBox>) : null}
    </>
  );
}

function TodayPanel({ d }: { d: CompanyDetail }) {
  const x = d.today as (CompanyDetail['today'] & { sessionDate?: string | null }) | null;
  if (!x) return null;
  const day = x.sessionDate ? new Date(x.sessionDate + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null;
  const change = x.close != null && x.prevClose != null ? x.close - x.prevClose : null;
  const pct = change != null && x.prevClose ? (change / x.prevClose) * 100 : null;
  return (
    <div className="panel"><h3>{x.live ? <><Tr text="Today's trading" /> · <Tr text="live" /></> : <><Tr text="Last session" />{day ? ' · ' + day : ''}</>}</h3>
      <div className="facts">
        <Fact label="Open">{taka(x.open)}</Fact>
        <Fact label="High">{taka(x.high)}</Fact>
        <Fact label="Low">{taka(x.low)}</Fact>
        <Fact label={x.live ? 'Last price' : 'Close'}>{taka(x.close)}</Fact>
        <Fact label="Previous close">{taka(x.prevClose)}</Fact>
        <Fact label="Change"><span className={tone(change)}>{change != null ? `${change >= 0 ? '+' : '−'}৳${fmt(Math.abs(change))} (${signed(pct, 2)})` : '—'}</span></Fact>
        <Fact label="Volume (shares)">{fmt(x.volume, 0)}</Fact>
        <Fact label="Value traded">{x.valueMn != null ? crore(x.valueMn * 1e6, 2) : '—'}</Fact>
        <Fact label="Trades">{fmt(x.trades, 0)}</Fact>
      </div>
    </div>
  );
}

export function Overview({ d }: { d: CompanyDetail }) {
  const c = d.company, sp = c.sharePattern.at(-1);
  return (
    <>
      {d.today ? <TodayPanel d={d} /> : null}
      <div style={{ marginTop: d.today ? 14 : 0 }}><KeyFacts d={d} /></div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Price" /> <Info text="Tap or hover the line to see the price on each day." /></h3><PriceChart c={c} /></div>
      <div style={{ marginTop: 14 }}><BuyPlanner key={c.code} code={c.code} bar={<RangeBar52 c={c} />} /></div>
      <div className="panel" style={{ marginTop: 14 }}><h3><Tr text="Who owns the shares" /></h3><ShareholdingDonut sp={sp} height={200} />
        <p className="why"><Tr text="As on" /> {sp?.date || '—'}.</p></div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="panel"><h3><Tr text="Why this signal" /></h3>
          <ul className="reasons">{d.analysis.reasons.map((r, i) => { const [ic, cls] = TONE_ICON[r.tone] ?? TONE_ICON.neutral; return <li key={i}><Icon name={ic} className={cls} /><span>{r.text}</span></li>; })}</ul></div>
        <div className="panel"><h3><Tr text="What past data says" /></h3>
          <ul className="reasons">{d.analysis.history.length ? d.analysis.history.map((h, i) => <li key={i}><Icon name="trend" className="t-neutral" /><span>{h}</span></li>) : <li><Tr text="Not enough history." /></li>}</ul></div>
      </div>
    </>
  );
}
