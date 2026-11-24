'use client';

import { useState } from 'react';
import { dropUnreadable, exportData, importData, useBrowserData, useKeyStopped, type Mode, type Saved } from '@/components/portfolio-store';
import { BACKUP_MAX_BYTES, backupSummary, parseBackup, type MyData } from '@/lib/backup';
import css from '@/app/portfolio/trades.module.css';
import { useLang } from '@/components/i18n';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function KeyStoppedNote() {
  const { t } = useLang();
  return useKeyStopped() ? <div className="note warn" role="status">{t('Your Google Sheet password stopped working, so this shows the data saved in this browser. Reconnect below.')}</div> : null;
}

// Saved data this browser cannot read is never thrown away silently: the rest keeps working and the user decides.
export function UnreadableNote() {
  const { trades, plans } = useBrowserData();
  const [error, setError] = useState<string | null>(null);
  const parts = ([['trades', trades], ['plans', plans]] as [string, Saved<unknown>][]).filter(([, s]) => s.unreadable != null || s.bad.length > 0);
  if (!parts.length) return null;
  return (
    <div className="note warn" role="status">
      {parts.map(([which, s]) => {
        const whole = s.unreadable != null;
        return (
          <p key={which}>
            <b>{whole ? `The ${which} saved in this browser could not be read.` : `${s.bad.length} saved ${s.bad.length === 1 ? which.slice(0, -1) : which} could not be read.`}</b> Everything else still works.
            <span className={css.actions}>
              <button className="btn" type="button" onClick={() => download(`unreadable-${which}.json`, s.unreadable ?? JSON.stringify(s.bad, null, 2))}>{whole ? 'Download the raw copy' : 'Download the unreadable data'}</button>
              <button className="link-btn danger" type="button" onClick={() => {
                if (!window.confirm(whole ? `Start with no ${which}? Download the raw copy first if you want to keep it.` : `Remove the ${s.bad.length} unreadable ${which}?`)) return;
                try { dropUnreadable(which as 'trades' | 'plans'); setError(null); } catch (e) { setError(message(e, 'Could not change the saved data.')); }
              }}>{whole ? 'Start empty' : 'Remove them'}</button>
            </span>
          </p>
        );
      })}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </div>
  );
}

// One JSON file with everything this page uses; import checks the whole file before it writes anything.
export function BackupPanel({ mode, onChanged }: { mode: Mode; onChanged: () => void }) {
  const { t } = useLang();
  const [file, setFile] = useState<MyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const exportIt = async () => {
    try { const b = await exportData(); download(`trade-helper-${b.exportedAt.slice(0, 10)}.json`, JSON.stringify(b, null, 2)); setError(null); } catch (e) { setError(message(e, 'Could not export your data.')); }
  };
  const pick = async (f: File) => {
    setDone(null);
    const r = f.size > BACKUP_MAX_BYTES ? { ok: false as const, error: 'This file is too large to be a Trade Helper backup.' } : parseBackup(await f.text());
    if (r.ok) { setFile(r.value); setError(null); } else { setFile(null); setError(r.error); }
  };
  const apply = (how: 'add' | 'replace') => {
    if (!file || (how === 'replace' && !window.confirm('Replace everything saved in this browser with this file?'))) return;
    try { importData(file, how); setFile(null); setError(null); setDone(`Imported: ${backupSummary(file)}.`); onChanged(); } catch (e) { setError(message(e, 'Could not import the file.')); }
  };

  return (
    <div className={css.section}>
      <div className={css.actions}>
        <button className="btn" type="button" onClick={() => void exportIt()}>{t('Export my data')}</button>
        {mode === 'sheet' ? <span className="small muted">{t('Import works with Google Sheet sync off.')}</span> : (
          <label className="btn">{t('Import my data')}<input className="sr-only" type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} /></label>
        )}
      </div>
      {file ? (
        <div className={`note ${css.section}`} role="status">
          {t(`This file has ${backupSummary(file)}.`)}
          <div className={css.actions}>
            <button className="btn primary" type="button" onClick={() => apply('add')}>{t('Add to what is here')}</button>
            <button className="btn" type="button" onClick={() => apply('replace')}>{t('Replace what is here')}</button>
            <button className="link-btn" type="button" onClick={() => setFile(null)}>{t('Cancel')}</button>
          </div>
        </div>
      ) : null}
      {done ? <p className="small t-good" role="status">{t(done)}</p> : null}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </div>
  );
}
