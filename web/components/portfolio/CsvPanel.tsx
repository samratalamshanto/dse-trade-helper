'use client';

import { useRef, useState } from 'react';
import { parseCsv, dedupLots, toCsv, type Lot } from '@/lib/portfolio';
import { fmt } from '@/components/format';
import { useLang } from '@/components/i18n';
import styles from '@/app/portfolio/portfolio.module.css';
import { Icon } from '@/components/ui';

interface Props {
  lots: Lot[];
  knownCodes?: string[];
  onImport: (lots: Lot[], replace: boolean) => void;
}

export function CsvPanel({ lots, knownCodes, onImport }: Props) {
  const { t, lang } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [dedupSkipped, setDedupSkipped] = useState(0);
  const [fileError, setFileError] = useState('');

  const codeSet = knownCodes && knownCodes.length > 0 ? new Set(knownCodes) : undefined;

  function parse(t: string) { return parseCsv(t, codeSet); }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError('');
    f.text().then((t) => { setPaste(t); setPreview(parse(t)); setDedupSkipped(0); }).catch((err: unknown) => {
      console.warn('portfolio: could not read the chosen CSV file', err);
      setPreview(null);
      setFileError(t('Could not read this file. Save it as CSV (comma, semicolon or tab) and try again.'));
    });
  }

  function handlePaste(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setPaste(e.target.value);
    setPreview(e.target.value.trim() ? parse(e.target.value) : null);
    setDedupSkipped(0);
  }

  function doImport() {
    if (!preview || !preview.lots.length) return;
    if (replaceMode && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    if (replaceMode) {
      onImport(preview.lots, true);
    } else {
      const { unique, skippedCount } = dedupLots(preview.lots, lots);
      setDedupSkipped(skippedCount);
      if (!unique.length && skippedCount > 0) {
        setConfirmReplace(false);
        return;
      }
      onImport(unique, false);
    }
    setConfirmReplace(false);
    setPaste(''); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function exportCsv() {
    const text = toCsv(lots);
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'portfolio.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div>
      <div className={styles.csvArea}>
        <div>
          <div className={`small muted ${styles.csvHelp}`}>
            {t('Import from a broker statement CSV. Columns detected by header name: code/symbol, quantity/shares, avg cost/buy price. Comma, semicolon, and tab delimiters are supported.')}
          </div>
          <label htmlFor="csv-file" className={`btn ${styles.fileBtn}`}>
            <Icon name="upload" />{t('Choose broker file')}
          </label>
          <input id="csv-file" ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleFile}
            className="sr-only" />
          {fileError ? <p className="note bad" role="alert">{fileError}</p> : null}
          <div className={styles.gapTop}>
            <label htmlFor="csv-paste" className={styles.fieldLabel}>{t('Or paste CSV text:')}</label>
            <textarea id="csv-paste" className={styles.csvPaste} value={paste} onChange={handlePaste}
              aria-label="Paste CSV text to import" placeholder="code,shares,avg cost&#10;GP,100,50" />
          </div>
        </div>

        <div>
          {preview && (
            <div>
              <p className={`small ${styles.previewLine}`}>
                <span className={styles.previewOk}>{lang === 'bn' ? `${preview.lots.length} টি সারি আমদানি হবে।` : `${preview.lots.length} row${preview.lots.length !== 1 ? 's' : ''} will be imported.`}</span>
                {preview.skipped.length > 0 && <span className={styles.previewSkipped}> {lang === 'bn' ? `${preview.skipped.length} টি বাদ দেওয়া হয়েছে।` : `${preview.skipped.length} skipped.`}</span>}
              </p>
              {dedupSkipped > 0 && (
                <p className={`small ${styles.previewLine}`}>
                  <span className={styles.previewSkipped}>{lang === 'bn' ? `${dedupSkipped} টি ডুপ্লিকেট লট বাদ দেওয়া হয়েছে (ইতিমধ্যে পোর্টফোলিওতে আছে)।` : `${dedupSkipped} duplicate lot${dedupSkipped !== 1 ? 's' : ''} skipped (already in portfolio).`}</span>
                </p>
              )}
              {preview.lots.length > 0 && (
                <table className={`cards ${styles.previewTable}`}>
                  <thead><tr><th>{t('Code')}</th><th className="n">{t('Shares')}</th><th className="n">{t('Buy price')}</th></tr></thead>
                  <tbody>
                    {preview.lots.slice(0, 5).map((l, i) => (
                      <tr key={i}><td className="mono">{l.code}</td><td className="n mono">{l.shares}</td><td className="n mono">৳{fmt(l.buyPrice)}</td></tr>
                    ))}
                    {preview.lots.length > 5 && <tr><td colSpan={3} className="muted small">{lang === 'bn' ? `…এবং আরো ${preview.lots.length - 5} টি` : `…and ${preview.lots.length - 5} more`}</td></tr>}
                  </tbody>
                </table>
              )}
              {preview.skipped.map((s) => (
                <div key={s.row} className={styles.previewSkipped}>Row {s.row}: {s.reason}</div>
              ))}
              <div className={styles.replaceRow}>
                <label className={styles.replaceLabel}>
                  <input type="checkbox" checked={replaceMode} onChange={(e) => { setReplaceMode(e.target.checked); setConfirmReplace(false); }} />
                  {t('Replace existing holdings')}
                </label>
              </div>
              {confirmReplace && (
                <div className={`note bad ${styles.confirmBox}`} role="alert">
                  <b>{t('Replace all holdings?')}</b> {lang === 'bn' ? `এটি বর্তমান ${lots.length} টি হোল্ডিং মুছে ${preview.lots.length} টি নতুন আমদানি করবে।` : `This will delete all ${lots.length} current holding${lots.length !== 1 ? 's' : ''} and import ${preview.lots.length} new one${preview.lots.length !== 1 ? 's' : ''}.`}
                  <div className={styles.confirmActions}>
                    <button type="button" className="btn danger" onClick={doImport}>
                      {t('Yes, replace all')}
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirmReplace(false)}>{t('Cancel')}</button>
                  </div>
                </div>
              )}
              {!confirmReplace && (
                <button type="button" className={`btn primary ${styles.gapTop}`} onClick={doImport} disabled={!preview.lots.length}>
                  {lang === 'bn' ? `${preview.lots.length} টি হোল্ডিং ${replaceMode ? t('Replace') : t('Append')}` : `${replaceMode ? 'Replace' : 'Append'} ${preview.lots.length} holding${preview.lots.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {lots.length > 0 && (
        <div className={styles.exportRow}>
          <button type="button" className="btn" onClick={exportCsv}>{t('Export holdings as CSV')}</button>
          <span className="small muted">{lang === 'bn' ? `${lots.length} টি লট → portfolio.csv` : `${lots.length} lot${lots.length !== 1 ? 's' : ''} → portfolio.csv`}</span>
        </div>
      )}
    </div>
  );
}
