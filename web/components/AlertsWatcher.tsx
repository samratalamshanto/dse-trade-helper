'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/components/AppProvider';
import { useStoredValue } from '@/components/useStored';
import { parseAlertStore, evaluateRules, applyFiredResult, encodeAlertStore, dhakaDate, rulesForSession } from '@/lib/alerts';
import type { CompanyRow, CalendarRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import styles from './AlertsWatcher.module.css';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Calendar { upcoming: CalendarRow[]; session: MarketSession | null }
interface Toast { id: string; message: string }

const MAX_TOASTS = 3;
const TOAST_EVENT = 'dse-alert-toast';

// Multi-tab: rules and fired keys as saved right now (another tab or the alerts page may have changed them).
// A damaged saved value is ignored, so it can never replace the user's rules with an empty list.
function latestStore(raw: string) {
  try {
    const ls = localStorage.getItem('alerts');
    if (ls) { JSON.parse(ls); return parseAlertStore(ls); }
  } catch (err) {
    console.warn('alerts: saved rules in this tab are unreadable, using the last good copy', err);
  }
  return parseAlertStore(raw);
}

export function AlertsWatcher() {
  const { data } = useApi<Companies>('/api/companies');
  const { data: cal } = useApi<Calendar>('/api/dividends');
  const [raw, setRaw] = useStoredValue('alerts', '{}');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevRaw = useRef<string | null>(null);
  const prevRef = useRef<{ rows: CompanyRow[] | null; upcoming: CalendarRow[] | null }>({ rows: null, upcoming: null });

  useEffect(() => {
    const handler = (e: Event) => {
      const events = (e as CustomEvent<Toast[]>).detail;
      setToasts((prev) => [...prev, ...events].slice(-MAX_TOASTS));
    };
    addEventListener(TOAST_EVENT, handler);
    return () => removeEventListener(TOAST_EVENT, handler);
  }, []);

  useEffect(() => {
    const rows = data?.rows ?? null;
    const upcoming = cal?.upcoming ?? null;
    if (!rows) return;
    const rawChanged = raw !== prevRaw.current;
    if (!rawChanged && rows === prevRef.current.rows && upcoming === prevRef.current.upcoming) return;
    prevRef.current = { rows, upcoming };
    prevRaw.current = raw;

    const store = latestStore(raw);
    if (!store.rules.length) return;

    const today = dhakaDate();
    const rules = rulesForSession(store.rules, data?.session?.sessionDate, today);
    const result = evaluateRules(rules, rows, upcoming ?? [], today, store.fired);
    if (!result.events.length) return;
    const novelEvents = result.events;

    const newStore = applyFiredResult(store, result, today);
    setRaw(encodeAlertStore(newStore));

    dispatchEvent(new CustomEvent<Toast[]>(TOAST_EVENT, {
      detail: novelEvents.map((e) => ({ id: e.key, message: e.message })),
    }));

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      for (const e of novelEvents) {
        try {
          new Notification(`DSE Alert: ${e.code}`, { body: e.message, tag: e.key });
        } catch (err) {
          console.warn('alerts: browser notification failed, the in-page toast still shows', err);
        }
      }
    }
  }, [data, cal, raw, setRaw]);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className={styles.area} role="region" aria-live="polite" aria-label="Alert notifications" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} role="status">
          <span className={styles.msg}>{t.message}</span>
          <button
            className={styles.dismiss}
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
