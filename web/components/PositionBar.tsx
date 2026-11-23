// Where a price sits between its 52-week low (left) and high (right); shared by the /range and /dividends pages.
export function PositionBar({ position }: { position: number }) {
  const pct = Math.round(position * 100);
  const left = Math.round(position * 44);
  return (
    <span
      role="img"
      aria-label={`${pct}% from the low`}
      style={{
        display: 'inline-block', width: '56px', height: '8px',
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
