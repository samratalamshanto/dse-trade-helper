// Turns a value series into an SVG polyline "x,y x,y" string that fills width × height.
export function sparkPoints(values: readonly number[], width: number, height: number, pad = 2): string {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return '';
  const min = Math.min(...xs);
  const span = Math.max(...xs) - min || 1;
  const step = width / (xs.length - 1);
  return xs.map((v, i) => `${(i * step).toFixed(1)},${(pad + (1 - (v - min) / span) * (height - 2 * pad)).toFixed(1)}`).join(' ');
}

export const RANGES = ['1W', '1M', '3M', '6M', '1Y'] as const;
export type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365 };

// Keeps the points within the range, counted back in calendar days from the last point.
export function sliceSeries<P extends { date: string }>(series: readonly P[], range: Range): P[] {
  if (!series.length) return [];
  const end = Date.parse(series[series.length - 1].date + 'T00:00:00Z');
  const from = new Date(end - RANGE_DAYS[range] * 86_400_000).toISOString().slice(0, 10);
  return series.filter((p) => p.date >= from);
}

export function seriesChange(series: readonly { price: number }[]): { abs: number; pct: number | null } | null {
  if (series.length < 2) return null;
  const first = series[0].price;
  const abs = series[series.length - 1].price - first;
  return { abs, pct: first > 0 ? (abs / first) * 100 : null };
}

export interface PieSlice { index: number; value: number; pct: number; path: string; labelX: number; labelY: number }

const point = (cx: number, cy: number, r: number, angle: number) => [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];

// Full-circle pie: SVG path per non-empty part, clockwise from 12 o'clock, plus a label point at 62% of the radius.
export function pieSlices(values: readonly (number | null | undefined)[], cx: number, cy: number, r: number): PieSlice[] {
  const clean = values.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  let start = 0;
  return clean.flatMap((value, index) => {
    if (value <= 0) return [];
    const sweep = (value / total) * 2 * Math.PI;
    const end = start + sweep;
    const [x1, y1] = point(cx, cy, r, start);
    const [x2, y2] = point(cx, cy, r, end);
    const [lx, ly] = point(cx, cy, r * 0.62, start + sweep / 2);
    // A single part is the whole circle; an arc from a point to itself would draw nothing, so use two half arcs.
    const path = sweep >= 2 * Math.PI - 1e-9
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
      : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    start = end;
    return [{ index, value, pct: (value / total) * 100, path, labelX: lx, labelY: ly }];
  });
}
