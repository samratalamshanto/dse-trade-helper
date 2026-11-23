'use client';

import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { call } from '@/components/trades-client';

const POLL_MS = 3_000;
interface Link { url: string; expiresAt: string }

// Signed-in users: connect their own Telegram chat by a one-time link (button on phones, QR code to scan on a computer).
export function TelegramConnect() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const s = await call<{ connected: boolean; paused?: boolean }>('', '/api/telegram/status');
    setConnected(s.connected);
    setPaused(!!s.paused);
    return s.connected;
  }, []);

  useEffect(() => {
    void Promise.resolve().then(check).catch((e: unknown) => { setConnected(false); setError(e instanceof Error ? e.message : 'Could not check Telegram.'); });
  }, [check]);

  // While a link is open, check every few seconds until the user taps Start in Telegram or the link expires.
  useEffect(() => {
    if (!link) return;
    const t = setInterval(() => {
      if (Date.now() > Date.parse(link.expiresAt)) { setLink(null); setError('The link expired. Tap Connect Telegram again.'); return; }
      void check().then((ok) => { if (ok) setLink(null); }).catch((e: unknown) => console.warn('telegram: status check failed', e));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [link, check]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Telegram did not answer. Try again.'); } finally { setBusy(false); }
  };
  const connect = () => run(async () => setLink(await call<Link>('', '/api/telegram/link', { method: 'POST' })));
  const disconnect = () => run(async () => { await call('', '/api/telegram/link', { method: 'DELETE' }); setConnected(false); });

  if (connected === null && !error) return <p className="small muted">Checking Telegram…</p>;
  return (
    <div>
      {connected ? (
        <>
          <p className="small" role="status">{paused
            ? 'Paused: your Google sign-in ended. Sign out and sign in with Google again (panel below); alerts resume by themselves.'
            : 'Connected ✓ Alerts from your own Sheet come to your Telegram on trading days.'}</p>
          <p><button className="btn" type="button" disabled={busy} onClick={() => void disconnect()}>Disconnect Telegram</button></p>
        </>
      ) : link ? (
        <div className="tg-connect">
          <ol className="small">
            <li>On this phone: tap <b>Open Telegram</b>. On a computer: scan the code with your phone camera.</li>
            <li>In Telegram, tap <b>Start</b>. This page shows Connected by itself.</li>
          </ol>
          <p><a className="btn primary" href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Open Telegram (opens in a new tab)">Open Telegram ↗</a></p>
          <QRCodeSVG value={link.url} size={168} marginSize={2} title="Scan to connect Telegram" />
          <p className="small muted">The link works once and ends in 10 minutes.</p>
        </div>
      ) : (
        <>
          <p className="small">Get a Telegram message when a plan reaches its price, a holding hits your stop-loss or target, or a dividend&apos;s last buy day is near.</p>
          <p><button className="btn primary" type="button" disabled={busy} onClick={() => void connect()}>Connect Telegram</button></p>
        </>
      )}
      {error ? <p className="small" role="alert">{error}</p> : null}
    </div>
  );
}
