// Server-only access to the public DSE website. DSE sends no CORS header, so browsers cannot call it directly.
const DSE = 'https://www.dse.com.bd';
const FETCH_TIMEOUT_MS = 5_000;
export const FAILURE_TTL_MS = 10_000;
const CACHE_MAX = 200;
export const SNAPSHOT_TTL_MS = 30_000;
// A saved copy is served while a refresh runs only if it is at most two cache periods old, so prices stay current.
export const STALE_MAX_MS = 2 * SNAPSHOT_TTL_MS;

export interface SnapshotRow {
  code: string; ltp: number; ycp: number; open: number; high: number; low: number; close: number;
  volume: number; value: number; trades: number; percent: number | null; category: string; board: string; sector: string; assetType: string;
}

export interface IndexValue { key: string; value: number; change: number | null; percent: number | null; prev?: number }
export interface DailyTotal { date: string; turnover: number; volume: number; trades: number; advanced: number; declined: number; unchanged: number }
export interface Mover { code: string; closep: number; pct: number }
export interface Session {
  isOpen?: boolean; phase?: string; tradingDay?: boolean; opening?: string; date?: string; sessionDate?: string;
  today?: { date?: string; opening?: string }; next?: { date?: string };
}

export interface Snapshot {
  market: {
    indices: IndexValue[];
    totals: { trades: number; volume: number; turnover: number; marketCap: number; tradeTime?: string };
    breadth: { advanced: number; declined: number; unchanged: number };
    previousSession?: DailyTotal;
    dailyTotals?: DailyTotal[];
    topMovers?: { sessionDate?: string; cp?: { gainers?: Mover[]; losers?: Mover[] } };
  };
  prices: { cols: string[]; rows: unknown[][]; session?: Session };
}

export interface Intraday { key: string; points: { t: string; value: number }[]; day: string | null }

export interface MarketSession {
  isOpen: boolean; phase: string | null; tradingDay: boolean; sessionDate: string | null;
  opening: string | null; today: string | null; next: string | null; dataTime: string | null;
}

const cache = new Map<string, { at: number; ttl: number; settled: boolean; value: Promise<unknown> }>();
const lastGood = new Map<string, { at: number; value: unknown }>();
const stamps = new Map<string, number>();

function put<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= CACHE_MAX) map.delete(map.keys().next().value as string);
  map.set(key, value);
}

// A failed load serves the last good value (or the error) for FAILURE_TTL_MS, so a DSE outage costs one fetch per window.
// With staleMaxMs, a last good value younger than that answers at once while one refresh per key runs in the background.
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, staleMaxMs = 0): Promise<T> {
  const good = lastGood.get(key);
  const stale = good && Date.now() - good.at < staleMaxMs ? Promise.resolve(good.value as T) : null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return (!hit.settled && stale) || (hit.value as Promise<T>);
  const entry = { at: Date.now(), ttl: ttlMs, settled: false, value: Promise.resolve() as Promise<unknown> };
  entry.value = load().then((v) => { entry.settled = true; put(lastGood, key, { at: Date.now(), value: v }); return v; }, (e: unknown) => {
    Object.assign(entry, { at: Date.now(), ttl: FAILURE_TTL_MS, settled: true });
    if (!lastGood.has(key)) throw e;
    console.warn(`load ${key} failed; serving the last good value`, e);
    return lastGood.get(key)?.value;
  });
  put(cache, key, entry);
  return stale ?? (entry.value as Promise<T>);
}

// Waits past FAILURE_TTL_MS, because cached() keeps a failed load for that long and would hand back the same error.
export const RETRY_WAIT_MS = FAILURE_TTL_MS + 5_000;
export async function withRetry<T>(load: () => Promise<T>, tries = 3, waitMs = RETRY_WAIT_MS): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await load(); } catch (e) {
      if (i >= tries) throw e;
      console.warn(`attempt ${i} of ${tries} failed; retrying in ${waitMs / 1000} s`, e);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export const remember = (key: string): void => put(stamps, key, Date.now());

export function seen(key: string, ttlMs: number): boolean {
  const at = stamps.get(key);
  return at !== undefined && Date.now() - at < ttlMs;
}

// Marks a failure of DSE itself (unreachable, timeout, HTTP error, unreadable body), as opposed to a bug in this app.
export class UpstreamError extends Error {}

export async function fetchDse(urlPath: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(DSE + urlPath, {
      headers: { 'User-Agent': 'Mozilla/5.0 dse-helper' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (e) {
    throw new UpstreamError(`DSE ${urlPath} could not be reached`, { cause: e });
  }
  if (!res.ok) throw Object.assign(new UpstreamError(`DSE ${urlPath} returned HTTP ${res.status}`), { status: res.status });
  return res;
}

async function fetchJson<T>(urlPath: string): Promise<T> {
  const res = await fetchDse(urlPath);
  try { return await res.json() as T; } catch (e) { throw new UpstreamError(`DSE ${urlPath} sent unreadable JSON`, { cause: e }); }
}

export const snapshot = () => cached('snapshot', SNAPSHOT_TTL_MS, () => fetchJson<Snapshot>('/api/live/snapshot'), STALE_MAX_MS);

export const intraday = () => cached('intraday', SNAPSHOT_TTL_MS, () => fetchJson<Intraday>('/api/live/index-intraday?code=DSEX'), STALE_MAX_MS);

export async function livePrices(): Promise<Record<string, SnapshotRow>> {
  const snap = await snapshot();
  const cols = snap.prices.cols;
  return Object.fromEntries(snap.prices.rows.map((r) => [String(r[0]), Object.fromEntries(cols.map((c, i) => [c, r[i]])) as unknown as SnapshotRow]));
}

export async function marketSession(): Promise<MarketSession> {
  const snap = await snapshot();
  const s = snap.prices.session || {};
  return {
    isOpen: !!s.isOpen, phase: s.phase || null, tradingDay: !!s.tradingDay, sessionDate: s.sessionDate || null,
    opening: s.today?.opening || s.opening || null, today: s.today?.date || null, next: s.next?.date || null,
    dataTime: snap.market?.totals?.tradeTime || null,
  };
}
