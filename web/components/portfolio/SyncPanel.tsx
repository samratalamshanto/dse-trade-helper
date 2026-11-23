'use client';

import { useState, type FormEvent } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { SHEET_URL_STORE, SIGNED_IN_STORE } from '@/components/trades-client';
import { useStoredValue, writeStored } from '@/components/useStored';
import { connectSheet, disconnectSheet, moveBrowserDataToSheet, useBrowserData, type Mode } from '@/components/portfolio-store';
import css from '@/app/portfolio/trades.module.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A Sheet or network fault (no status, or 5xx) gets one plain sentence; a 4xx keeps the server's own plain reason.
function plain(err: unknown, failed: string): string {
  const status = (err as { status?: number }).status;
  if (status === 401) return 'That password is not right.';
  return err instanceof Error && status != null && status < 500 ? err.message : failed;
}

// Optional: switches the one data source from this browser to a Google Sheet (the user's own by Google sign-in, or the owner's by password) and back.
export function SyncPanel({ mode, onChanged }: { mode: Mode; onChanged: () => void }) {
  const { trades, plans, hasLimits } = useBrowserData();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = mode === 'sheet';
  const [signedIn] = useStoredValue(SIGNED_IN_STORE, '');
  const google = signedIn === '1';
  const [sheetLink] = useStoredValue(SHEET_URL_STORE, '');
  // The flag goes first, so the page never asks the Sheet with a session that is ending.
  const leave = () => { writeStored(SIGNED_IN_STORE, ''); writeStored(SHEET_URL_STORE, ''); void signOut(); };
  // Also shown in owner-key mode: a Google sign-in then takes over with the user's own Sheet.
  const googleButton = <button className="btn primary" type="button" disabled={busy} onClick={() => void signIn('google')}>Continue with Google</button>;
  const pending = sheet && (trades.good.length + plans.good.length > 0 || hasLimits);
  // "1 trade and your limits", "2 trades, 1 plan and your limits": zero counts are left out.
  const left = [trades.good.length ? plural(trades.good.length, 'trade', 'trades') : '', plans.good.length ? plural(plans.good.length, 'plan', 'plans') : '', hasLimits ? 'your limits' : ''].filter(Boolean);
  const leftText = left.length > 1 ? `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}` : left[0] ?? '';
  const single = left.length === 1 && trades.good.length + plans.good.length === 1;

  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    try { await work(); setError(null); } catch (err) { setError(plain(err, failed)); } finally { setBusy(false); onChanged(); }
  };
  const connect = (e: FormEvent) => { e.preventDefault(); void run(async () => { await connectSheet(draft.trim()); setDraft(''); }, 'Could not reach your Google Sheet. Try again in a minute.'); };

  return (
    <details className={`panel ${css.section}`} open={open || pending} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="h3">Sync with my Google Sheet</summary>
      {sheet ? (
        <>
          <p className="small" role="status">{google ? 'Signed in with Google: your trades, plans, watchlist and broker rate are saved in the "DSE Trade Helper" Sheet in your Google Drive.' : 'Connected: your trades, plans, watchlist and broker rate are saved in your Google Sheet.'}</p>
          {pending ? (
            <div className="note warn" role="status">
              <b>{leftText} {single ? 'is' : 'are'} still saved only in this browser.</b> Move {single ? 'it' : 'them'} into your Google Sheet so every device shows {single ? 'it' : 'them'}. Each one leaves this browser once it is saved.{hasLimits ? ' Your limits here replace the limits saved in the Sheet.' : ''}
              <div className={css.actions}><button className="btn primary" type="button" disabled={busy} onClick={() => void run(moveBrowserDataToSheet, 'Could not reach your Google Sheet. Nothing was lost: press Move again to carry on.')}>Move into my Google Sheet</button></div>
            </div>
          ) : null}
          {google ? (
            <div className={css.actions}>
              {sheetLink ? <a className="btn primary" href={sheetLink} target="_blank" rel="noopener noreferrer" aria-label="Open my Google Sheet (opens in a new tab)">Open my Google Sheet ↗</a> : null}
              <button className="btn" type="button" disabled={busy} onClick={leave}>Sign out</button>
            </div>
          ) : (
            <div className={css.actions}>
              <button className="btn" type="button" disabled={busy} onClick={() => { disconnectSheet(); onChanged(); }}>Disconnect</button>
              {googleButton}
            </div>
          )}
          <p className="small muted">{google ? 'Sign out' : 'Disconnect'} switches back to this browser. Nothing in the Sheet is deleted.</p>
        </>
      ) : (
        <>
          <p className="small">Right now your trades stay in this browser. Sign in with Google to keep them in your own Google Sheet and see them on every device.</p>
          <p className="small muted">We only see the one Sheet we create for you. Your other Google Drive files stay private.</p>
          <div className={css.actions}>{googleButton}</div>
          <details className={css.section}>
            <summary className="small muted">For the site owner</summary>
            <form className={css.form} onSubmit={connect}>
              <label>Sync password<input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} required minLength={16} /></label>
              <div className={css.actions}><button className="btn" type="submit" disabled={busy}>Connect</button></div>
            </form>
          </details>
        </>
      )}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </details>
  );
}
