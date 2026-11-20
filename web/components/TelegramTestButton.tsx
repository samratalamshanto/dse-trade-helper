'use client';
import { useState } from 'react';
import { call, ensureKey } from '@/components/trades-client';

export default function TelegramTestButton() {
  const [msg, setMsg] = useState('');
  async function test() {
    setMsg('Sending…');
    try {
      const r = await call<{ sent: boolean; error?: string }>(await ensureKey(), '/api/notify/test', { method: 'POST' });
      setMsg(r.sent ? 'Sent — check Telegram.' : r.error ?? 'Not sent.');
    } catch (e) {
      console.warn('telegram test failed', e);
      setMsg((e as Error).message);
    }
  }
  return (
    <p>
      <button type="button" className="btn" onClick={test}>Send test to Telegram</button>{' '}
      <span role="status">{msg}</span>
    </p>
  );
}
