import { dhakaToday, fmtDate } from '@/components/format';
import { Tr } from '@/components/Tr';
import { Info } from '@/components/ui';
import { tradingDaysBetween } from '@/lib/dhaka';

type BuyDates = { lastBuyDate?: string | null; lastBuyEstimated?: boolean };

export const isTooLate = (r: BuyDates, today = dhakaToday()): boolean => !!r.lastBuyDate && r.lastBuyDate < today;

// Trading days you can still buy on, today included when today is a trading day.
export function DaysLeft({ r }: { r: BuyDates }) {
  const today = dhakaToday();
  if (!r.lastBuyDate || isTooLate(r, today)) return null;
  const n = tradingDaysBetween(today, r.lastBuyDate);
  if (n <= 1 && r.lastBuyDate === today) return <span className="pill s-caution"><Tr text="last day today" /></span>;
  return <span className={`pill ${n <= 2 ? 's-caution' : 's-research'}`}>{n} <Tr text={n === 1 ? 'trading day left' : 'trading days left'} /></span>;
}

export function LastBuy({ r }: { r: BuyDates }) {
  if (!r.lastBuyDate) return <>—</>;
  const late = isTooLate(r);
  return (
    <>
      <span className={`mono${late ? ' muted' : ''}`}>{fmtDate(r.lastBuyDate)}</span>
      {r.lastBuyEstimated ? <> <span className="small muted" title="DSE has not posted its spot-market notice yet. This is the trading day before the record date."><Tr text="est." /></span></> : null}
      {late ? <> <span className="pill s-neutral"><Tr text="too late" /></span> <Info text="Too late: the last day to buy has passed, so buying now does not get this dividend." /></> : <> <DaysLeft r={r} /></>}
    </>
  );
}
