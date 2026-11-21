'use client';

import { useState, type FormEvent } from 'react';
import { connectSheet, disconnectSheet, moveBrowserDataToSheet, useBrowserData, type Mode } from '@/components/portfolio-store';
import css from '@/app/portfolio/trades.module.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A Sheet or network fault (no status, or 5xx) gets one plain sentence; a 4xx keeps the server's own plain reason.
function plain(err: unknown, failed: string): string {
  const status = (err as { status?: number }).status;
  if (status === 401) return 'That password is not right.';
  return err instanceof Error && status != null && status < 500 ? err.message : failed;
}

// Optional, for the site owner: switches the one data source from this browser to the Google Sheet and back.
export function SyncPanel({ mode, onChanged }: { mode: Mode; onChanged: () => void }) {
  const { trades, plans, hasLimits } = useBrowserData();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = mode === 'sheet';
  const pending = sheet && (trades.good.length + plans.good.length > 0 || hasLimits);

  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    try { await work(); setError(null); } catch (err) { setError(plain(err, failed)); } finally { setBusy(false); onChanged(); }
  };
  const connect = (e: FormEvent) => { e.preventDefault(); void run(async () => { await connectSheet(draft.trim()); setDraft(''); }, 'Could not reach your Google Sheet. Try again in a minute.'); };

  return (
    <details className={`panel ${css.section}`} open={open || pending} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="h3">Sync with my Google Sheet</summary>
      <p className="small muted">Keep your trades and plans in your own Google Sheet so they show on every device and Telegram alerts can use them. Only for the site owner: needs the site&apos;s sync password.</p>
      {sheet ? (
        <>
          <p className="small" role="status">Connected: your trades and plans are saved in your Google Sheet.</p>
          {pending ? (
            <div className="note warn" role="status">
              <b>{plural(trades.good.length, 'trade', 'trades')} and {plural(plans.good.length, 'plan', 'plans')}{hasLimits ? ' and your limits' : ''} are still saved only in this browser.</b> Move them into your Google Sheet so every device shows them. Each one leaves this browser once it is saved.{hasLimits ? ' Your limits here replace the limits saved in the Sheet.' : ''}
              <div className={css.actions}><button className="btn primary" type="button" disabled={busy} onClick={() => void run(moveBrowserDataToSheet, 'Could not reach your Google Sheet. Nothing was lost: press Move again to carry on.')}>Move into my Google Sheet</button></div>
            </div>
          ) : null}
          <div className={css.actions}><button className="btn" type="button" disabled={busy} onClick={() => { disconnectSheet(); onChanged(); }}>Disconnect</button></div>
          <p className="small muted">Disconnect goes back to this browser. Nothing in the Sheet is deleted.</p>
        </>
      ) : (
        <form className={css.form} onSubmit={connect}>
          <label>Password<input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} required minLength={16} /></label>
          <div className={css.actions}><button className="btn primary" type="submit" disabled={busy}>Connect</button></div>
        </form>
      )}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </details>
  );
}
