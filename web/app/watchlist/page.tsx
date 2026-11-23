'use client';

import { useMemo, useRef, useState } from 'react';
import { useMode } from '@/components/portfolio-store';
import Link from 'next/link';
import { Tr } from '@/components/Tr';
import { useRouter } from 'next/navigation';
import { useApi } from '@/components/AppProvider';
import { ChangeText } from '@/components/CompanyCard';
import { LastBuy } from '@/components/LastBuy';
import { useWatchlist, WatchButton } from '@/components/Watchlist';
import { fmt, fmtDate, pctNum, sectorName } from '@/components/format';
import { FraudPill, Icon, SignalPill, type FraudLevel, type Signal } from '@/components/ui';
import { useLang } from '@/components/i18n';
import type { CalendarRow, CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import { CompanySearch } from '@/components/CompanySearch';
import { PositionBar } from '@/components/PositionBar';
import { rangeStats } from '@/lib/range';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Calendar { upcoming: CalendarRow[]; recent: CalendarRow[]; session: MarketSession | null }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};

export default function WatchlistPage() {
  const { t } = useLang();
  const { codes, has, toggle } = useWatchlist();
  const tradesKey = useMode().mode === 'sheet';
  const router = useRouter();
  const { data, error } = useApi<Companies>('/api/companies');
  const { data: cal } = useApi<Calendar>('/api/dividends');
  const byCode = Object.fromEntries((data?.rows || []).map((r) => [r.code, r]));
  const nextDividend = Object.fromEntries((cal?.upcoming || []).map((r) => [r.code, r]));
  const recentDividend = Object.fromEntries((cal?.recent || []).map((r) => [r.code, r]));

  const [pickQ, setPickQ] = useState('');
  const [pickedCode, setPickedCode] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchData = useMemo(() => (data?.rows || []).map((r) => ({ code: r.code, name: r.name, signal: r.signal })), [data]);
  const watchedSet = useMemo(() => new Set(codes), [codes]);

  const addCompany = () => {
    if (!pickedCode || has(pickedCode)) return;
    toggle(pickedCode);
    setAnnouncement(t('Added {code} to your watchlist').replace('{code}', pickedCode));
    setPickQ('');
    setPickedCode('');
    inputRef.current?.focus();
  };

  const alreadyWatched = Boolean(pickedCode) && has(pickedCode);

  return (
    <>
      <h1><Tr text="Watchlist" /></h1>
      <p className="muted">{tradesKey ? 'Companies you saved. They are kept in your Google Sheet, so every device shows the same list.' : 'Companies you saved. They are stored in this browser only, so they do not appear on your other devices.'}</p>
      {error && !data ? <div className="note bad">Could not load prices: {error}. Your saved list is safe; try Refresh.</div> : null}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div className="picker-row">
        <CompanySearch
          companies={searchData}
          value={pickQ}
          onChange={(q) => { setPickQ(q); setPickedCode(''); }}
          onPick={(code) => { setPickedCode(code); setPickQ(code); }}
          label={t('Add a company')}
          placeholder={t('Company code or name')}
          watched={watchedSet}
          inputRef={inputRef}
        />
        <button
          type="button"
          className="btn primary"
          disabled={!pickedCode || alreadyWatched}
          onClick={addCompany}
          aria-label={alreadyWatched ? t('Already in watchlist') : t('Add')}
        >
          {alreadyWatched ? t('Already in watchlist') : t('Add')}
        </button>
      </div>
      {!codes.length ? (
        <div className="panel empty-state">
          <Icon name="star" />
          <p><b><Tr text="Your watchlist is empty." /></b></p>
          <p className="muted">Press the ☆ next to a company in <Link href="/all"><Tr text="Companies" /></Link>, or the <b>Save</b> button on a company page.</p>
          <p><Link className="btn primary" href="/all"><Tr text="Browse companies" /></Link></p>
        </div>
      ) : (
        <div className="panel table-wrap"><table className="cards">
          <thead><tr><th>Company</th><th className="n">Price</th><th className="n">Today</th><th>Signal</th><th>Warning-sign check</th><th className="n">Yield</th><th>Next dividend</th><th>{t('Decision facts')}</th></tr></thead>
          <tbody>{codes.map((code) => {
            const r = byCode[code];
            const dv = nextDividend[code];
            const rdv = recentDividend[code];
            const rs = r ? rangeStats({ code: r.code, price: r.price ?? null, weekLow52: r.weekLow52, weekHigh52: r.weekHigh52 }) : null;
            return (
              <tr key={code} onClick={() => router.push('/c/' + encodeURIComponent(code))}>
                <td><div className="co-cell"><WatchButton code={code} /><div>
                  <a className="mono" href={'/c/' + encodeURIComponent(code)} onClick={(e) => e.stopPropagation()}><b>{code}</b></a>
                  <div className="small muted">{r ? `${r.name} · ${sectorName(r.sector)} · Cat ${r.category}` : data ? 'Not in the latest DSE list' : 'Loading…'}</div>
                  <div className="small" onClick={(e) => e.stopPropagation()}>
                    <a href={'/alerts?code=' + encodeURIComponent(code)} className="muted">{t('Alert')}</a>
                    {' · '}
                    <a href={'/c/' + encodeURIComponent(code) + '#planner-title'} className="muted">{t('Plan')}</a>
                  </div>
                </div></div></td>
                <td className="n mono" data-label="Price">{r ? '৳' + fmt(r.price) : '—'}</td>
                <td className="n mono" data-label="Today">{r ? <ChangeText pct={r.changePct} /> : '—'}</td>
                <td data-label="Signal">{r ? <SignalPill signal={r.signal as Signal} href={'/c/' + encodeURIComponent(code)} missed={r.missed} /> : '—'}</td>
                <td data-label="Warning-sign check">{r ? <FraudPill level={r.fraud as FraudLevel} href={'/c/' + encodeURIComponent(code) + '#safety'} flags={r.flags} /> : '—'}</td>
                <td className="n mono" data-label="Yield">{r?.dividendYield != null ? fmt(r.dividendYield, 1) + '%' : '—'}</td>
                <td data-label="Next dividend">
                  {dv
                    ? <>{pctNum(dv.cashPct)}% · buy by <LastBuy r={dv} /><div className="small muted">record date {fmtDate(dv.recordDate)}</div></>
                    : rdv && rdv.cashPct != null
                      ? <span className="muted">declared ৳{fmt((rdv.cashPct / 100) * rdv.faceValue, 2)} · record date passed</span>
                      : <span className="muted">none announced</span>}
                </td>
                <td data-label="Decision facts">
                  {r ? (
                    <div className="small">
                      {rs ? <div><PositionBar position={rs.position} /> {fmt(rs.aboveLowPct, 1)}% above 52-wk low</div> : null}
                      {r.pe != null && r.avgPastPe != null ? <div className="muted">P/E {fmt(r.pe, 1)} vs usual {fmt(r.avgPastPe, 1)}</div> : null}
                      {r.epsCagr != null ? <div className="muted">EPS {r.epsCagr >= 0 ? '↑' : '↓'}{fmt(Math.abs(r.epsCagr), 1)}%/yr</div> : null}
                      {r.nextExpected ? <div className="muted">{t('results ~')}{monthLabel(r.nextExpected)}</div> : null}
                    </div>
                  ) : '—'}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <p className="why">Prices refresh every minute while the market is open. Press ★ to remove a company.</p>
    </>
  );
}
