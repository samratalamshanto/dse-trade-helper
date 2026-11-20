'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useApi } from '@/components/AppProvider';
import { ChangeText } from '@/components/CompanyCard';
import { LastBuy } from '@/components/LastBuy';
import { Tr } from '@/components/Tr';
import { useStoredValue } from '@/components/useStored';
import { useWatchlist } from '@/components/Watchlist';
import { fmt, fmtDate } from '@/components/format';
import { FraudPill, SignalPill, type FraudLevel, type Signal } from '@/components/ui';
import { parseLots } from '@/lib/portfolio';
import type { CalendarRow, CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Calendar { upcoming: CalendarRow[]; session: MarketSession | null }

// The user's own codes (watchlist and portfolio) at a glance, shown only when they saved something.
export function MyStocks() {
  const { codes: watched } = useWatchlist();
  const [rawLots] = useStoredValue('portfolio', '[]');
  const codes = useMemo(() => [...new Set([...parseLots(rawLots).map((l) => l.code), ...watched])], [rawLots, watched]);
  const { data } = useApi<Companies>(codes.length ? '/api/companies' : null);
  const { data: cal } = useApi<Calendar>(codes.length ? '/api/dividends' : null);
  if (!codes.length) return null;
  const byCode = Object.fromEntries((data?.rows || []).map((r) => [r.code, r]));
  const divByCode = Object.fromEntries((cal?.upcoming || []).map((r) => [r.code, r]));

  return (
    <section className="panel my-stocks" aria-labelledby="my-stocks-title">
      <div className="today-head"><h2 className="h3" id="my-stocks-title"><Tr text="My stocks today" /></h2>
        <span className="small muted"><Tr text="From your watchlist and portfolio" /></span></div>
      <ul className="today-list">{codes.map((code) => {
        const r = byCode[code], dv = divByCode[code];
        return (
          <li key={code}>
            <span><Link href={'/c/' + encodeURIComponent(code)} className="mono"><b>{code}</b></Link>{r ? <span className="mono small"> ৳{fmt(r.price)}</span> : null}</span>
            <span className="my-stock-facts">
              {r ? <span className="mono small"><ChangeText pct={r.changePct} /></span> : <span className="small muted">{data ? <Tr text="not in the DSE list" /> : '…'}</span>}
              {r ? <SignalPill signal={r.signal as Signal} /> : null}
              {r && r.fraud !== 'clean' ? <span title={r.flags.join(', ')}><FraudPill level={r.fraud as FraudLevel} /></span> : null}
              {dv ? <span className="small"><Tr text="buy by" /> <LastBuy r={dv} /> · <Tr text="record date" /> {fmtDate(dv.recordDate)}</span> : null}
            </span>
          </li>
        );
      })}</ul>
    </section>
  );
}
