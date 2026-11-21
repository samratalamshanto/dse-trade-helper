'use client';

import { useMemo } from 'react';
import { useStoredValue } from '@/components/useStored';
import { parseLots, toCsv, type Lot } from '@/lib/portfolio';
import css from '@/app/portfolio/trades.module.css';

// Holdings saved by the old browser-only Portfolio page. They move into the trades once, on the owner's click.
export function OldLots({ postLot, onDone, busy }: { postLot: (lot: Lot) => Promise<void>; onDone: (err?: unknown) => void; busy: boolean }) {
  const [raw, setRaw] = useStoredValue('portfolio', '[]');
  const lots = useMemo(() => parseLots(raw), [raw]);
  if (!lots.length) return null;
  // Each holding leaves the browser copy right after it is saved, so a retry after a failure never adds it twice.
  const move = async () => {
    let left = lots;
    try {
      for (const l of lots) { await postLot(l); left = left.slice(1); setRaw(JSON.stringify(left)); }
      onDone();
    } catch (err) { onDone(err); }
  };
  const csvHref = 'data:text/csv;charset=utf-8,' + encodeURIComponent(toCsv(lots));
  return (
    <div className="note warn" role="status">
      <b>{lots.length} {lots.length === 1 ? 'holding is' : 'holdings are'} saved only in this browser</b> from the old Portfolio page ({lots.map((l) => l.code).join(', ')}).
      Move them into your trades so every page shows the same shares. Each one is saved as a buy at its price and date (today if it had no date).
      This browser&apos;s copy is removed once each one is saved.
      <div className={css.actions}>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void move()}>Move {lots.length} into my trades</button>
        <a className="btn" href={csvHref} download="old-portfolio.csv">Download a copy first</a>
      </div>
    </div>
  );
}
