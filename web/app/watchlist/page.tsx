'use client';

import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useRouter } from 'next/navigation';
import { useApi } from '@/components/AppProvider';
import { ChangeText } from '@/components/CompanyCard';
import { LastBuy } from '@/components/LastBuy';
import { useWatchlist, WatchButton } from '@/components/Watchlist';
import { useStoredValue } from '@/components/useStored';
import { KEY_STORE } from '@/components/trades-client';
import { fmt, fmtDate, pctNum, sectorName } from '@/components/format';
import { FraudPill, Icon, SignalPill, type FraudLevel, type Signal } from '@/components/ui';
import type { CalendarRow, CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Calendar { upcoming: CalendarRow[]; session: MarketSession | null }

export default function WatchlistPage() {
  const { codes } = useWatchlist();
  const [tradesKey] = useStoredValue(KEY_STORE, '');
  const router = useRouter();
  const { data, error } = useApi<Companies>('/api/companies');
  const { data: cal } = useApi<Calendar>('/api/dividends');
  const byCode = Object.fromEntries((data?.rows || []).map((r) => [r.code, r]));
  const nextDividend = Object.fromEntries((cal?.upcoming || []).map((r) => [r.code, r]));

  return (
    <>
      <h1><Tr text="Watchlist" /></h1>
      <p className="muted">{tradesKey ? 'Companies you saved. They are kept in your Google Sheet, so every device shows the same list.' : 'Companies you saved. They are stored in this browser only, so they do not appear on your other devices.'}</p>
      {error && !data ? <div className="note bad">Could not load prices: {error}. Your saved list is safe; try Refresh.</div> : null}
      {!codes.length ? (
        <div className="panel empty-state">
          <Icon name="star" />
          <p><b><Tr text="Your watchlist is empty." /></b></p>
          <p className="muted">Press the ☆ next to a company in <Link href="/all"><Tr text="Companies" /></Link>, or the <b>Save</b> button on a company page.</p>
        </div>
      ) : (
        <div className="panel table-wrap"><table className="cards">
          <thead><tr><th>Company</th><th className="n">Price</th><th className="n">Today</th><th>Signal</th><th>Fraud check</th><th className="n">Yield</th><th>Next dividend</th></tr></thead>
          <tbody>{codes.map((code) => {
            const r = byCode[code];
            const dv = nextDividend[code];
            return (
              <tr key={code} onClick={() => router.push('/c/' + encodeURIComponent(code))}>
                <td><div className="co-cell"><WatchButton code={code} /><div><a className="mono" href={'/c/' + encodeURIComponent(code)} onClick={(e) => e.stopPropagation()}><b>{code}</b></a>
                  <div className="small muted">{r ? `${r.name} · ${sectorName(r.sector)} · Cat ${r.category}` : data ? 'Not in the latest DSE list' : 'Loading…'}</div></div></div></td>
                <td className="n mono" data-label="Price">{r ? '৳' + fmt(r.price) : '—'}</td>
                <td className="n mono" data-label="Today">{r ? <ChangeText pct={r.changePct} /> : '—'}</td>
                <td data-label="Signal">{r ? <SignalPill signal={r.signal as Signal} /> : '—'}</td>
                <td data-label="Fraud check">{r ? <FraudPill level={r.fraud as FraudLevel} /> : '—'}</td>
                <td className="n mono" data-label="Yield">{r?.dividendYield != null ? fmt(r.dividendYield, 1) + '%' : '—'}</td>
                <td data-label="Next dividend">{dv ? <>{pctNum(dv.cashPct)}% · buy by <LastBuy r={dv} /><div className="small muted">record date {fmtDate(dv.recordDate)}</div></> : <span className="muted">none announced</span>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <p className="why">Prices refresh every minute while the market is open. Press ★ to remove a company.</p>
    </>
  );
}
