'use client';

import { Chart as ChartJS, registerables, type Scale } from 'chart.js';
import { cloneElement, useEffect, useState, type ReactElement } from 'react';

ChartJS.register(...registerables);
ChartJS.defaults.animation = false;
ChartJS.defaults.interaction.mode = 'index';
ChartJS.defaults.interaction.intersect = false;

const TOKENS = ['--muted', '--border', '--accent', '--up', '--down', '--warn', '--panel', '--text'] as const;
export type Colors = Record<(typeof TOKENS)[number], string>;

function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(t).trim()])) as Colors;
}

// Chart.js draws on canvas, so it cannot use CSS variables directly; re-read them whenever the theme changes.
export function useChartColors(): Colors | null {
  const [colors, setColors] = useState<Colors | null>(null);
  useEffect(() => {
    const update = () => {
      const c = readColors();
      ChartJS.defaults.color = c['--muted'];
      ChartJS.defaults.borderColor = c['--border'];
      setColors(c);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);
  return colors;
}

// react-chartjs-2 renders <canvas role="img">, so the accessible name must go on the canvas itself.
export function ChartBox({ height = 240, label, children }: { height?: number; label?: string; children: ReactElement<{ 'aria-label'?: string }> }) {
  return <div className="chart-box" style={{ height }}>{label ? cloneElement(children, { 'aria-label': label }) : children}</div>;
}

// X-axis ticks for ISO-date labels: "22 Oct" when the chart spans under ~4 months, else "Oct '25".
export const dateTicks = {
  maxTicksLimit: 6,
  callback(this: Scale, v: string | number) {
    const iso = this.getLabelForValue(Number(v));
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
    const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'), span = (this.chart.data.labels?.length ?? 0) > 90;
    return span ? d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) + " '" + iso.slice(2, 4) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  },
};
