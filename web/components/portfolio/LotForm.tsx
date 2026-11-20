'use client';

import { useId, useState } from 'react';
import type { Lot } from '@/lib/portfolio';
import { CODE_RE } from '@/lib/dhaka';
import type { CompanyRow } from '@/lib/service';
import { useLang } from '@/components/i18n';
import styles from '@/app/portfolio/portfolio.module.css';

interface Props {
  companies: CompanyRow[];
  initial?: Lot;
  onSave: (lot: Lot) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

type Errors = { code?: string; shares?: string; buyPrice?: string; buyDate?: string };

function validate(code: string, shares: string, buyPrice: string, buyDate: string): Errors {
  const e: Errors = {};
  if (!code.trim()) e.code = 'Required';
  else if (!CODE_RE.test(code.trim().toUpperCase())) e.code = 'Invalid code';
  const s = Number(shares);
  if (!shares.trim()) e.shares = 'Required';
  else if (!Number.isInteger(s) || s <= 0) e.shares = 'Must be a whole number > 0';
  const p = Number(buyPrice);
  if (!buyPrice.trim()) e.buyPrice = 'Required';
  else if (!Number.isFinite(p) || p <= 0) e.buyPrice = 'Must be > 0';
  if (buyDate && !/^\d{4}-\d{2}-\d{2}$/.test(buyDate)) e.buyDate = 'Use YYYY-MM-DD';
  return e;
}

export function LotForm({ companies, initial, onSave, onCancel, submitLabel = 'Add holding' }: Props) {
  const { t } = useLang();
  const uid = useId();
  const [code, setCode] = useState(initial?.code ?? '');
  const [shares, setShares] = useState(initial ? String(initial.shares) : '');
  const [buyPrice, setBuyPrice] = useState(initial ? String(initial.buyPrice) : '');
  const [buyDate, setBuyDate] = useState(initial?.buyDate ?? '');
  const [touched, setTouch] = useState<Partial<Record<keyof Errors, true>>>({});
  const errors = validate(code, shares, buyPrice, buyDate);
  const hasError = Object.keys(errors).length > 0;

  const blur = (k: keyof Errors) => setTouch((t) => ({ ...t, [k]: true }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouch({ code: true, shares: true, buyPrice: true, buyDate: true });
    if (hasError) return;
    onSave({ code: code.trim().toUpperCase(), shares: Number(shares), buyPrice: Number(buyPrice), ...(buyDate ? { buyDate } : {}) });
    if (!initial) { setCode(''); setShares(''); setBuyPrice(''); setBuyDate(''); setTouch({}); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className={styles.formGrid}>
        <div className={styles.fieldWrap}>
          <label htmlFor={uid + 'code'} className={styles.fieldLabel}>{t('Stock code')}</label>
          <input id={uid + 'code'} list={uid + 'list'} className={`${styles.fieldInput}${touched.code && errors.code ? ' ' + styles.invalid : ''}`}
            value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => blur('code')}
            aria-invalid={!!(touched.code && errors.code)} aria-describedby={uid + 'code-err'}
            placeholder="e.g. ACIFORMULA" autoComplete="off" required />
          <datalist id={uid + 'list'}>{companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</datalist>
          <span id={uid + 'code-err'} className={styles.fieldError} role="alert">{touched.code ? t(errors.code ?? '') : ''}</span>
        </div>

        <div className={styles.fieldWrap}>
          <label htmlFor={uid + 'shares'} className={styles.fieldLabel}>{t('Shares')}</label>
          <input id={uid + 'shares'} type="number" min="1" step="1" className={`${styles.fieldInput}${touched.shares && errors.shares ? ' ' + styles.invalid : ''}`}
            value={shares} onChange={(e) => setShares(e.target.value)} onBlur={() => blur('shares')}
            aria-invalid={!!(touched.shares && errors.shares)} aria-describedby={uid + 'shares-err'}
            placeholder="e.g. 100" required />
          <span id={uid + 'shares-err'} className={styles.fieldError} role="alert">{touched.shares ? t(errors.shares ?? '') : ''}</span>
        </div>

        <div className={styles.fieldWrap}>
          <label htmlFor={uid + 'price'} className={styles.fieldLabel}>{t('Buy price (৳)')}</label>
          <input id={uid + 'price'} type="number" min="0.01" step="any" className={`${styles.fieldInput}${touched.buyPrice && errors.buyPrice ? ' ' + styles.invalid : ''}`}
            value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} onBlur={() => blur('buyPrice')}
            aria-invalid={!!(touched.buyPrice && errors.buyPrice)} aria-describedby={uid + 'price-err'}
            placeholder="e.g. 120.50" required />
          <span id={uid + 'price-err'} className={styles.fieldError} role="alert">{touched.buyPrice ? t(errors.buyPrice ?? '') : ''}</span>
        </div>

        <div className={styles.fieldWrap}>
          <label htmlFor={uid + 'date'} className={styles.fieldLabel}>{t('Buy date (optional)')}</label>
          <input id={uid + 'date'} type="date" className={`${styles.fieldInput}${touched.buyDate && errors.buyDate ? ' ' + styles.invalid : ''}`}
            value={buyDate} onChange={(e) => setBuyDate(e.target.value)} onBlur={() => blur('buyDate')}
            aria-invalid={!!(touched.buyDate && errors.buyDate)} aria-describedby={uid + 'date-err'} />
          <span id={uid + 'date-err'} className={styles.fieldError} role="alert">{touched.buyDate ? t(errors.buyDate ?? '') : ''}</span>
        </div>
      </div>

      <div className={styles.formActions}>
        <button type="submit" className="btn primary">{t(submitLabel)}</button>
        {onCancel && <button type="button" className="link-btn" onClick={onCancel}>{t('Cancel')}</button>}
      </div>
    </form>
  );
}
