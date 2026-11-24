import type { ReactNode } from 'react';
import { fmt } from '@/components/format';
import { useLang } from '@/components/i18n';
import type { Valued } from '@/components/trades-client';
import { MAX_WEIGHT_PCT } from '@/lib/buy-planner';
import { breakEvenPrice } from '@/lib/positions';
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

// dividends: cash dividends on the shares held now (null while loading or unknown, undefined when nothing is held).
export function Summary({ holdings, commissionPaid, dividends, children }: { holdings: Valued[]; commissionPaid: number; dividends?: number | null; children?: ReactNode }) {
  const { t } = useLang();
  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  const value = holdings.reduce((a, h) => a + (h.value ?? h.invested), 0);
  const realised = holdings.reduce((a, h) => a + h.realised, 0);
  const pl = value - invested;
  const withDividends = dividends == null ? null : pl + dividends;
  return (
    <div className={`panel ${css.summary}`}>
      <div><div className={css.label}>{t('Value now')}</div><div className={css.value}>৳{fmt(value)}</div></div>
      <div><div className={css.label}>{t('Invested')}</div><div className={css.value}>৳{fmt(invested)}</div></div>
      <div><div className={css.label}>{t('Profit / loss now')}</div><div className={`${css.value} ${tone(pl)}`}>{signed(pl)}{invested ? ` (${fmt((pl / invested) * 100)}%)` : ''}</div></div>
      {dividends === undefined ? null : (
        <div><div className={css.label}>{t('Profit / loss with dividends')}</div><div className={`${css.value} ${tone(withDividends)}`}>{signed(withDividends)}</div>
          {dividends != null ? <div className="small muted">{t(`includes ৳${fmt(dividends)} cash dividends`)}</div> : null}</div>
      )}
      <div><div className={css.label}>{t('Profit / loss from sales')}</div><div className={`${css.value} ${tone(realised)}`}>{signed(realised)}</div></div>
      <div><div className={css.label}>{t('Broker fees paid')}</div><div className={css.value}>৳{fmt(commissionPaid)}</div></div>
      {children ? <div className={css.summaryAction}>{children}</div> : null}
    </div>
  );
}

// Facts for the holding's Details row; numbers only, no advice.
export function SellFacts({ h, dividends, feePct, weightPct }: { h: Valued; dividends: number | null; feePct: number; weightPct: number | null }) {
  const { t } = useLang();
  const breakEven = breakEvenPrice(h.avgCost, feePct);
  const move = h.price ? ((breakEven - h.price) / h.price) * 100 : null;
  const withDividends = h.unrealised == null || dividends == null ? null : h.unrealised + dividends;
  const w = weightPct == null ? null : weightPct.toFixed(0);
  return (
    <ul className={css.reasons}>
      <li>{t('Profit / loss with dividends')}: <b className={tone(withDividends)}>{signed(withDividends)}</b>
        {withDividends != null ? ` (${t(`${signed(h.unrealised)} on price + ৳${fmt(dividends ?? 0)} cash dividends`)})` : ''}</li>
      <li>{t(`Break-even after the ${feePct}% sell commission`)}: <b>৳{fmt(breakEven)}</b>
        {move != null ? ` (${t(`${move > 0 ? '+' : ''}${move.toFixed(1)}% from the price now`)})` : ''}</li>
      {w != null ? <li>{weightPct! > MAX_WEIGHT_PCT ? t(`${w}% of your portfolio — above the ${MAX_WEIGHT_PCT}% line the planner uses`) : t(`${w}% of your portfolio`)}</li> : null}
    </ul>
  );
}
