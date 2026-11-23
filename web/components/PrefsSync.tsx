'use client';

import { useEffect, useRef, useState } from 'react';
import { call, KEY_STORE, SIGNED_IN_STORE } from '@/components/trades-client';
import { readStored, useStoredValue, writeStored } from '@/components/useStored';
import { encodeAlertStore, parseAlertStore, type AlertRule } from '@/lib/alerts';
import { BROKER_COMMISSION_PCT } from '@/lib/buy-planner';
import { parseAlertRules, parsePrefs, PREFS_SYNCED_STORE, type Prefs } from '@/lib/prefs';
import { commissionFor } from '@/lib/trades';
import { parseWatchlist } from '@/lib/watchlist';

const SAVE_DELAY_MS = 800;
// Set while a local change is not yet in the Sheet (failed save, tab closed before the save ran).
const DIRTY_STORE = 'prefsDirty';
const DEFAULT_PCT = String(BROKER_COMMISSION_PCT);

interface Local { watchlist: string[]; brokerCommissionPct: string; alertRules: AlertRule[] }
const bodyOf = (v: Local) => JSON.stringify(v);
const localNow = (): Local => ({
  watchlist: parseWatchlist(readStored('watchlist')),
  brokerCommissionPct: (readStored('brokerCommissionPct') ?? DEFAULT_PCT).trim(),
  alertRules: parseAlertRules(parseAlertStore(readStored('alerts')).rules),
});
// First sync of a browser: keep everything from both sides (rules by id, Sheet first).
const mergeRules = (sheet: AlertRule[], local: AlertRule[]) => parseAlertRules([...sheet, ...local.filter((r) => !sheet.some((s) => s.id === r.id))]);

// Signed in with Google or with a trades key, the watchlist, broker rate and price-alert rules follow the Sheet.
// On load: an unsaved local change wins; a browser's first sync merges both sides; otherwise the Sheet wins.
// Fired alerts and alert history stay per browser.
export function PrefsSync() {
  const [rawKey] = useStoredValue(KEY_STORE, '');
  const [signedIn] = useStoredValue(SIGNED_IN_STORE, '');
  // Which Sheet the prefs follow: the Google user's own one, or the owner's by key. '' = browser only.
  const who = signedIn === '1' ? 'google' : rawKey;
  const header = signedIn === '1' ? '' : rawKey;
  const [rawWatch, setWatch] = useStoredValue('watchlist', '[]');
  const [pct, setPct] = useStoredValue('brokerCommissionPct', DEFAULT_PCT);
  const [rawAlerts, setAlerts] = useStoredValue('alerts', '{}');
  const [loadedFor, setLoadedFor] = useState('');
  const [visits, setVisits] = useState(0);
  const [loads, setLoads] = useState(0);
  const saved = useRef('');
  // Last rate the Sheet accepted; used while the rate box holds a value that is not valid yet.
  const lastRate = useRef(DEFAULT_PCT);

  // Coming back to the tab reads the Sheet again, so a device left open does not save old values over newer ones.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setVisits((n) => n + 1); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  useEffect(() => {
    if (!who) return;
    let active = true;
    call<Prefs>(header, '/api/prefs').then((p) => {
      if (!active) return;
      const local = localNow();
      const dirty = readStored(DIRTY_STORE) === '1';
      const first = readStored(PREFS_SYNCED_STORE) !== '1';
      const merged = parseWatchlist(JSON.stringify([...(p.watchlist ?? []), ...local.watchlist]));
      const next: Local = dirty ? local : {
        watchlist: first ? merged : p.watchlist ?? local.watchlist,
        brokerCommissionPct: p.brokerCommissionPct ?? local.brokerCommissionPct,
        alertRules: first ? mergeRules(p.alertRules ?? [], local.alertRules) : p.alertRules ?? local.alertRules,
      };
      setWatch(JSON.stringify(next.watchlist));
      setPct(next.brokerCommissionPct);
      setAlerts(encodeAlertStore({ ...parseAlertStore(readStored('alerts')), rules: next.alertRules }));
      writeStored(PREFS_SYNCED_STORE, '1');
      // Anything the Sheet does not hold exactly is uploaded by the save effect.
      saved.current = p.watchlist && p.brokerCommissionPct != null && p.alertRules
        ? bodyOf({ watchlist: p.watchlist, brokerCommissionPct: p.brokerCommissionPct, alertRules: p.alertRules }) : '';
      lastRate.current = p.brokerCommissionPct ?? DEFAULT_PCT;
      setLoadedFor(who);
      setLoads((n) => n + 1);
    }).catch((e: unknown) => console.warn('prefs: could not read the watchlist, broker rate and alert rules from the Sheet', e));
    return () => { active = false; };
  }, [who, header, visits, setWatch, setPct, setAlerts]);

  useEffect(() => {
    if (!who || loadedFor !== who) return;
    const now = localNow();
    // An unfinished rate (e.g. "0.") must not hold back watchlist or rule changes.
    const validRate = now.brokerCommissionPct === '' || commissionFor('1', '1', now.brokerCommissionPct) !== '';
    const body = bodyOf(validRate ? now : { ...now, brokerCommissionPct: lastRate.current });
    // A change undone before the save ran leaves nothing to save.
    if (body === saved.current) { writeStored(DIRTY_STORE, ''); return; }
    if (!parsePrefs(JSON.parse(body))) return;
    writeStored(DIRTY_STORE, '1');
    const t = setTimeout(() => {
      call(header, '/api/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
        .then(() => { saved.current = body; lastRate.current = JSON.parse(body).brokerCommissionPct; if (bodyOf(localNow()) === body) writeStored(DIRTY_STORE, ''); })
        .catch((e: unknown) => console.warn('prefs: could not save to the Sheet; it is saved on the next visit to this tab', e));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [who, header, loadedFor, loads, rawWatch, pct, rawAlerts]);

  return null;
}
