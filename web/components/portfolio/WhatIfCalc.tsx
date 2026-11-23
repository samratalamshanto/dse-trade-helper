'use client';

import { useMemo, useState } from 'react';
import type { CompanyRow, CalendarRow } from '@/lib/service';
import { pickDividend, dhakaDateString, nextPaymentMonth } from '@/lib/portfolio';
import { fmt, monthName } from '@/components/format';
import { useLang } from '@/components/i18n';
import styles from '@/app/portfolio/portfolio.module.css';

interface Props {
  companies: CompanyRow[];
  dividends: CalendarRow[];
}

export function WhatIfCalc({ companies, dividends }: Props) {
  const { t } = useLang();
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');

  const company = companies.find((c) => c.code === code);
  const today = dhakaDateString();
  const divRow = code ? pickDividend(dividends, code, today) : undefined;

  const price = company?.price ?? null;
  const shares = price != null && price > 0 && Number(amount) > 0 ? Math.floor(Number(amount) / price) : null;
  const cashPerShare = divRow?.cashPerShare ?? null;
  const perDeclIncome = shares != null && cashPerShare != null ? shares * cashPerShare : null;
  const nextMonth = divRow ? nextPaymentMonth(divRow, today) : null;
  const sorted = useMemo(() => [...companies].sort((a, b) => a.code.localeCompare(b.code)), [companies]);
  const noDividend = shares == null ? '—' : <span className="muted small">{t('No dividend data')}</span>;

  return (
    <section aria-label={t('Dividend from a new buy')}>
      <h3 className={styles.whatIfTitle}>{t('Dividend from a new buy')}</h3>
      <p className={`small muted ${styles.whatIfIntro}`}>{t('Pick a company and an investment amount to estimate dividend income.')}</p>

      <div className={styles.whatIfGrid}>
        <div className={styles.fieldWrap}>
          <label htmlFor="wi-code" className={styles.fieldLabel}>{t('Company')}</label>
          <select id="wi-code" className={styles.fieldInput} value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">{t('Select a company…')}</option>
            {sorted.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </div>
        <div className={styles.fieldWrap}>
          <label htmlFor="wi-amount" className={styles.fieldLabel}>{t('Amount (৳)')}</label>
          <input id="wi-amount" type="number" min="1" step="any" className={styles.fieldInput}
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 50000" />
        </div>
      </div>

      {price != null && (
        <div className={styles.whatIfResults}>
          <div className={styles.whatIfResult}>
            <div className={styles.whatIfLabel}>{t('Current price')}</div>
            <div className={styles.whatIfValue + ' mono'}>৳{fmt(price)}</div>
          </div>
          <div className={styles.whatIfResult}>
            <div className={styles.whatIfLabel}>{t('Whole shares')}</div>
            <div className={styles.whatIfValue + ' mono'}>{shares != null ? shares.toLocaleString() : <span className="muted small">{t('Enter an amount')}</span>}</div>
          </div>
          <div className={styles.whatIfResult}>
            <div className={styles.whatIfLabel}>{t('Per declaration (est.)')}</div>
            <div className={styles.whatIfValue + ' mono'}>{perDeclIncome != null ? '৳' + fmt(perDeclIncome) : noDividend}</div>
          </div>
          <div className={styles.whatIfResult}>
            <div className={styles.whatIfLabel}>{t('Next payment')}</div>
            <div className={styles.whatIfValue}>{nextMonth ? monthName(nextMonth) : <span className="muted small">{t('Unknown')}</span>}</div>
          </div>
        </div>
      )}
    </section>
  );
}
