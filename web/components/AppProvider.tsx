'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MarketSession } from '@/lib/dse';
import { refreshDue } from '@/components/format';

const AUTO_REFRESH_MS = 60_000;
const MIN_VISIBLE_REFRESH_GAP_MS = 30_000;
// A component that mounts just after another one's request finished (e.g. a page behind Suspense) reuses that answer.
const SETTLED_REUSE_MS = 5_000;

interface AppState {
  session: MarketSession | null;
  setSession: (s: MarketSession | null | undefined) => void;
  tick: number;
  freshTick: number;
  refresh: (opts?: { fresh?: boolean }) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<MarketSession | null>(null);
  const [tick, setTick] = useState(0);
  const [freshTick, setFreshTick] = useState(-1);
  const sessionRef = useRef<MarketSession | null>(null);

  const setSession = useCallback((s: MarketSession | null | undefined) => {
    if (!s) return;
    sessionRef.current = s;
    setSessionState(s);
  }, []);

  const lastRefresh = useRef(0);
  const tickRef = useRef(0);

  const refresh = useCallback((opts?: { fresh?: boolean }) => {
    lastRefresh.current = Date.now();
    tickRef.current += 1;
    if (opts?.fresh) setFreshTick(tickRef.current);
    setTick(tickRef.current);
  }, []);

  // Every minute around the open and while open; every few minutes otherwise, so a tab left open sees the next session.
  useEffect(() => {
    if (!lastRefresh.current) lastRefresh.current = Date.now();
    const tickIfDue = () => { if (!document.hidden && refreshDue(sessionRef.current, lastRefresh.current)) refresh(); };
    const onVisible = () => { if (Date.now() - lastRefresh.current >= MIN_VISIBLE_REFRESH_GAP_MS) tickIfDue(); };
    const id = setInterval(tickIfDue, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  return <AppContext.Provider value={{ session, setSession, tick, freshTick, refresh }}>{children}</AppContext.Provider>;
}

interface ApiResult<T> { data: T | null; error: string | null; loading: boolean }

const inflight = new Map<string, Promise<unknown>>();

function load(url: string, tick: number): Promise<unknown> {
  const key = tick + ' ' + url;
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
        return body;
      })
      .finally(() => setTimeout(() => inflight.delete(key), SETTLED_REUSE_MS));
    inflight.set(key, pending);
  }
  return pending;
}

// Loads a JSON API path, reloads on Refresh / auto-refresh, and keeps the old data visible while reloading.
export function useApi<T extends { session?: MarketSession | null }>(path: string | null): ApiResult<T> {
  const { tick, freshTick, setSession } = useApp();
  const [state, setState] = useState<ApiResult<T>>({ data: null, error: null, loading: true });
  const shownPath = useRef<string | null>(null);
  const loadedTick = useRef(-1);

  useEffect(() => {
    if (!path) return;
    let active = true;
    const samePath = shownPath.current === path;
    if (!samePath) setState({ data: null, error: null, loading: true });
    // Only the refresh that asked for fresh data bypasses the cache; a page opened later uses the normal path.
    const fresh = samePath && loadedTick.current !== tick && freshTick === tick;
    shownPath.current = path;
    loadedTick.current = tick;
    const url = fresh && path.startsWith('/api/company/') ? path + '?fresh=1' : path;
    load(url, tick)
      .then((body) => {
        if (!active) return;
        const data = body as T;
        setSession(data.session);
        setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (!active) return;
        setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : 'Request failed', loading: false }));
      });
    return () => { active = false; };
  }, [path, tick, freshTick, setSession]);

  return state;
}
