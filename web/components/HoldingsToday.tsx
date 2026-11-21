'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApi } from '@/components/AppProvider';
import { fmt } from '@/components/format';
import { ChangeText } from '@/components/CompanyCard';
import { CheckBadge, type TradesList } from '@/components/trades-client';
import { listTrades, useMode } from '@/components/portfolio-store';
import { dhakaToday } from '@/lib/dhaka';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

const CHECKS_STORE = 'holdingChecks';
interface Companies { rows: CompanyRow[]; session: MarketSession | null }
type Labels = Record<string, string>;

function previousLabels(): Labels {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKS_STORE) ?? '{}') as { labels?: unknown };
    return raw.labels && typeof raw.labels === 'object' ? (raw.labels as Labels) : {};
  } catch (e) {
    console.warn('holdingChecks: saved check labels are unreadable; starting fresh', e);
    return {};
  }
}

function saveLabels(labels: Labels) {
  try { localStorage.setItem(CHECKS_STORE, JSON.stringify({ date: dhakaToday(), labels })); } catch (e) { console.warn('holdingChecks: not saved in this browser', e); }
}

const signedMoney = (x: number) => `${x > 0 ? '+' : x < 0 ? '-' : ''}৳${fmt(Math.abs(x))}`;

// The user's own holdings (this browser or the Google Sheet) with today's check; hidden when there are none.
// onHeld tells the dashboard which codes are shown here, so My stocks does not list them a second time.
export function HoldingsToday({ onHeld }: { onHeld?: (codes: string[]) => void }) {
  const [list, setList] = useState<TradesList | null>(null);
  const [before, setBefore] = useState<Labels>({});
  const { data: companies } = useApi<Companies>(list ? '/api/companies' : null);

  const { mode, ready } = useMode();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    listTrades('real').then((l) => {
      if (!active) return;
      const labels = Object.fromEntries(l.holdings.flatMap((h) => (h.check ? [[h.code, h.check.label]] : [])));
      setBefore(previousLabels());
      saveLabels(labels);
      setList(l);
      onHeld?.(l.holdings.filter((h) => h.shares > 0).map((h) => h.code));
    }, (e: unknown) => console.warn('dashboard: holdings hidden, they could not be loaded', e));
    return () => { active = false; };
  }, [onHeld, ready, mode]);

  const held = list?.holdings.filter((h) => h.shares > 0) ?? [];
  if (!held.length) return null;
  const byCode = Object.fromEntries((companies?.rows ?? []).map((r) => [r.code, r]));
  const value = held.reduce((a, h) => a + (h.value ?? h.invested), 0);
  // Today's move per share = price - yesterday's close, where yesterday's close = price / (1 + change%).
  const today = held.reduce((a, h) => {
    const r = byCode[h.code];
    return r?.price && r.changePct != null ? a + h.shares * (r.price - r.price / (1 + r.changePct / 100)) : a;
  }, 0);

  return (
    <section className="panel my-stocks" aria-labelledby="holdings-today-title">
      <div className="today-head"><h2 className="h3" id="holdings-today-title">My holdings today</h2>
        <Link href="/portfolio" className="small">Open portfolio →</Link></div>
      <p className="small">Value <b className="mono">৳{fmt(value)}</b> · Today{' '}
        <b className={`mono ${today > 0 ? 'up' : today < 0 ? 'down' : ''}`}>{companies ? signedMoney(today) : '…'}</b></p>
      <ul className="today-list">{held.map((h) => {
        const changed = h.check && before[h.code] && before[h.code] !== h.check.label;
        return (
          <li key={h.code}>
            <span><Link href={'/c/' + encodeURIComponent(h.code)} className="mono"><b>{h.code}</b></Link> {byCode[h.code] ? <span className="mono small">৳{fmt(byCode[h.code].price)}</span> : null} <span className="small muted">{h.shares} {h.shares === 1 ? 'share' : 'shares'}</span></span>
            <span className="my-stock-facts">
              {byCode[h.code] ? <span className="mono small"><ChangeText pct={byCode[h.code].changePct} /></span> : null}
              {changed ? <span className="small t-warn" title={`Was: ${before[h.code]}`}>Changed since last visit</span> : null}
              {h.check ? <CheckBadge check={h.check} /> : null}
            </span>
          </li>
        );
      })}</ul>
      <p className="small muted">Checks use fixed rules on your numbers and public DSE data — a learning aid, not investment advice.</p>
    </section>
  );
}
