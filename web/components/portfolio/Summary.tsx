import type { ReactNode } from 'react';
import { fmt } from '@/components/format';
import { useLang } from '@/components/i18n';
import type { Valued } from '@/components/trades-client';
import css from '@/app/portfolio/trades.module.css';

export function tone(x: number | null): string {
  if (x == null || x === 0) return '';
  return x > 0 ? css.up : css.down;
}
export function signed(x: number | null): string {
  if (x == null) return '—';
  if (x > 0) return `+৳${fmt(x)}`;
  if (x < 0) return `-৳${fmt(-x)}`;
  return `৳${fmt(0)}`;
}

export function Summary({ holdings, commissionPaid, children }: { holdings: Valued[]; commissionPaid: number; children?: ReactNode }) {
  const { t } = useLang();
  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  const value = holdings.reduce((a, h) => a + (h.value ?? h.invested), 0);
  const realised = holdings.reduce((a, h) => a + h.realised, 0);
  const pl = value - invested;
  return (
    <div className={`panel ${css.summary}`}>
      <div><div className={css.label}>{t('Value now')}</div><div className={css.value}>৳{fmt(value)}</div></div>
      <div><div className={css.label}>{t('Invested')}</div><div className={css.value}>৳{fmt(invested)}</div></div>
      <div><div className={css.label}>{t('Profit / loss now')}</div><div className={`${css.value} ${tone(pl)}`}>{signed(pl)}{invested ? ` (${fmt((pl / invested) * 100)}%)` : ''}</div></div>
      <div><div className={css.label}>{t('Profit / loss from sales')}</div><div className={`${css.value} ${tone(realised)}`}>{signed(realised)}</div></div>
      <div><div className={css.label}>{t('Broker fees paid')}</div><div className={css.value}>৳{fmt(commissionPaid)}</div></div>
      {children ? <div className={css.summaryAction}>{children}</div> : null}
    </div>
  );
}
