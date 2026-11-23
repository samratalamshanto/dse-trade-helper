'use client';

import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { ChartBox, useChartColors } from '@/components/charts';
import { DHAKA_OFFSET_MS } from '@/lib/dhaka';
import { projectIncome, monthlyIncomeMap, dhakaDateString, type Lot } from '@/lib/portfolio';
import type { CalendarRow } from '@/lib/service';
import { fmt, monthName } from '@/components/format';
import { useLang } from '@/components/i18n';
import styles from '@/app/portfolio/portfolio.module.css';

function next12Months(): string[] {
  const months: string[] = [];
  const now = Date.now();
  // Build window in Dhaka time (UTC+6) so month boundaries match local date.
  const dhaka = new Date(now + DHAKA_OFFSET_MS);
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth() + i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// "Nov", "Dec", "Jan 27": the year shows only where it changes, so labels fit without turning.
function shortMonth(ym: string): string {
  const d = new Date(ym + '-01T00:00:00Z');
  const mon = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return ym.endsWith('-01') ? `${mon} ${ym.slice(2, 4)}` : mon;
}

interface Props {
  lots: Lot[];
  dividends: CalendarRow[];
  totalCost: number;
}

export function IncomeSection({ lots, dividends, totalCost }: Props) {
  const { t } = useLang();
  const colors = useChartColors();

  const today = dhakaDateString();
  const incomes = useMemo(() => projectIncome(lots, dividends, today), [lots, dividends, today]);
  const incomeMap = useMemo(() => monthlyIncomeMap(incomes), [incomes]);
  // next12Months is cheap; recomputes each render so the window never freezes.
  const months = next12Months();

  const chartData = months.map((m) => incomeMap.get(m) ?? 0);
  // The chart holds each company's next payment only; the yearly total counts every payment of the last 12 months.
  const yearlyTotal = incomes.reduce((s, inc) => s + (inc.yearlyIncome ?? 0), 0);
  const yieldOnCost = totalCost > 0 && yearlyTotal > 0 ? (yearlyTotal / totalCost) * 100 : null;

  const data = colors ? {
    labels: months.map(shortMonth),
    datasets: [{
      label: t('Expected income (৳)'),
      data: chartData,
      backgroundColor: colors['--accent'],
      borderRadius: 4,
    }],
  } : null;

  const options = {
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: (ctx: { parsed: { y: number } }) => ` ৳${fmt(ctx.parsed.y)}`,
    } } },
    scales: {
      y: { ticks: { callback: (v: number | string) => '৳' + fmt(Number(v), 0) } },
      x: { ticks: { maxRotation: 0 } },
    },
  };

  if (!lots.length) return null;

  return (
    <section aria-label={t('Dividend income planner')}>
      <h2>{t('Dividend income planner')}</h2>
      <p className="muted small">{t('Based on the last declared or expected dividend for each company you hold.')}</p>

      <div className={styles.incomeTotal}>
        <div className="metric">
          <div className="k">{t('Income, next 12 months')}</div>
          <div className="v mono">{yearlyTotal > 0 ? '৳' + fmt(yearlyTotal) : '—'}</div>
        </div>
        <div className="metric">
          <div className="k">{t('Yield on cost')}</div>
          <div className="v mono">{yieldOnCost != null ? fmt(yieldOnCost, 2) + '%' : '—'}</div>
        </div>
      </div>

      {data && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3 className="h3" style={{ fontSize: 14, marginBottom: 10 }}>{t('Expected monthly income — next 12 months')}</h3>
          <ChartBox height={220} label={t('Bar chart of expected dividend income by month')}>
            <Bar data={data} options={options} />
          </ChartBox>
        </div>
      )}

      <div className="panel table-wrap">
        <table className="cards">
          <thead><tr>
            <th>{t('Company')}</th><th className="n">{t('Shares')}</th><th className="n">{t('Per share (৳)')}</th>
            <th className="n">{t('Per declaration')}</th><th>{t('Expected month')}</th>
          </tr></thead>
          <tbody>
            {incomes.map((inc) => (
              <tr key={inc.code}>
                <td className="mono">{inc.code}</td>
                <td className="n mono" data-label="Shares">{inc.totalShares.toLocaleString()}</td>
                <td className="n mono" data-label="Per share">{inc.cashPerShare != null ? '৳' + fmt(inc.cashPerShare, 2) : <span className="muted">—</span>}</td>
                <td className="n mono" data-label="Per declaration">{inc.nextIncome != null ? '৳' + fmt(inc.nextIncome) : <span className="muted">—</span>}</td>
                <td data-label="Month">{inc.month ? monthName(inc.month) : <span className="muted">{t('Unknown')}</span>}</td>
              </tr>
            ))}
            {!incomes.length && <tr><td colSpan={5} className="empty">{t('No holdings yet.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
