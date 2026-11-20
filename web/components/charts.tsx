'use client';

import { Chart as ChartJS, registerables } from 'chart.js';
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
