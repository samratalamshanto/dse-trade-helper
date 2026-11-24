import { rangePct, rangePos } from '@/lib/dividend-checks';

// Where a price sits between its 52-week low (left) and high (right); shared by the /range and /dividends pages.
export function PositionBar({ position, width = 56 }: { position: number; width?: number }) {
  const pct = rangePct(position);
  const left = Math.round(position * (width - 12));
  return (
    <span
      role="img"
      aria-label={`${pct}% from the low`}
      style={{
        display: 'inline-block', width: `${width}px`, height: '8px',
        background: 'var(--border)', borderRadius: '4px', position: 'relative', verticalAlign: 'middle',
      }}
    >
      <span style={{
        position: 'absolute', left: `${left}px`, top: '-2px',
        width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent)',
      }} />
    </span>
  );
}

// The bar plus its percent, for list cells.
export function RangeCell({ price, low, high }: { price: number | null; low: number | null; high: number | null }) {
  const pos = rangePos(price, low, high);
  if (pos == null) return <span className="muted">—</span>;
  return <span className="range-cell"><PositionBar position={pos} width={40} /> <span className="small mono">{rangePct(pos)}%</span></span>;
}
