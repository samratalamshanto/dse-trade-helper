'use client';

import { Doughnut } from 'react-chartjs-2';
import { ChartBox, useChartColors } from '@/components/charts';
import type { AggregatedHolding } from '@/lib/portfolio';
import { fmt } from '@/components/format';
import { useLang } from '@/components/i18n';
import styles from '@/app/portfolio/portfolio.module.css';

// First 5 entries are CSS token names; last 5 are literal HSL values for holdings beyond the token set.
const PALETTE_TOKENS = ['--accent', '--up', '--warn', '--down', '--muted'] as const;
const PALETTE_EXTRA = [
  'hsl(260,55%,55%)',
  'hsl(190,60%,42%)',
  'hsl(28,80%,52%)',
  'hsl(330,60%,52%)',
  'hsl(145,50%,42%)',
] as const;

const MAX_SLICES = 10;

interface Props { holdings: AggregatedHolding[] }

export function AllocationChart({ holdings }: Props) {
  const { t, lang } = useLang();
  const colors = useChartColors();
  if (!colors) return null;

  const valued = holdings.filter((h) => h.value != null && h.value > 0);
  const totalValue = valued.reduce((s, h) => s + (h.value ?? 0), 0);
  if (!valued.length) return null;

  function sliceColor(i: number): string {
    if (i < PALETTE_TOKENS.length) return colors![PALETTE_TOKENS[i]];
    if (i < PALETTE_TOKENS.length + PALETTE_EXTRA.length) return PALETTE_EXTRA[i - PALETTE_TOKENS.length];
    return PALETTE_EXTRA[PALETTE_EXTRA.length - 1];
  }

  const top = valued.slice(0, MAX_SLICES - 1);
  const rest = valued.slice(MAX_SLICES - 1);
  const slices: { code: string; value: number }[] = top.map((h) => ({ code: h.code, value: h.value ?? 0 }));
  if (rest.length === 1) {
    slices.push({ code: rest[0].code, value: rest[0].value ?? 0 });
  } else if (rest.length > 1) {
    slices.push({ code: lang === 'bn' ? `${t('Other')} (${rest.length})` : `Other (${rest.length})`, value: rest.reduce((s, h) => s + (h.value ?? 0), 0) });
  }

  const data = {
    labels: slices.map((s) => s.code),
    datasets: [{
      data: slices.map((s) => s.value),
      backgroundColor: slices.map((_, i) => sliceColor(i)),
      borderColor: colors['--panel'],
      borderWidth: 2,
    }],
  };

  const options = {
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: (ctx: { label: string; parsed: number }) => ` ${ctx.label}: ৳${fmt(ctx.parsed)} (${((ctx.parsed / totalValue) * 100).toFixed(1)}%)`,
    } } },
  };

  return (
    <div className={styles.allotChart}>
      <div style={{ width: 180, height: 180, flex: 'none' }}>
        <ChartBox height={180} label={lang === 'bn' ? `মূল্য অনুযায়ী পোর্টফোলিও বরাদ্দ — ${slices.length} টি হোল্ডিং` : `Portfolio allocation by value — ${slices.length} holding${slices.length !== 1 ? 's' : ''}`}>
          <Doughnut data={data} options={options} />
        </ChartBox>
      </div>
      <div className={styles.allotLegend}>
        {slices.map((s, i) => (
          <div key={s.code} className={styles.allotItem}>
            <span className={styles.allotDot} style={{ background: sliceColor(i) }} aria-hidden="true" />
            <span className="mono small">{s.code}</span>
            <span className="muted small">{((s.value / totalValue) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <ul className="sr-only" aria-label={t('Portfolio allocation data')}>
        {slices.map((s) => (
          <li key={s.code}>{s.code}: ৳{fmt(s.value)} ({((s.value / totalValue) * 100).toFixed(1)}%)</li>
        ))}
      </ul>
    </div>
  );
}
