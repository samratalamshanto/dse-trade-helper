import type { Limits, LimitSettings, PositionCheck } from '@/lib/positions';
import type { Holding, Trade } from '@/lib/trades';
import { readStored, writeStored } from '@/components/useStored';

// Shared by /portfolio and the dashboard card: the stored trades key, the keyed API call and the check badge.
export const KEY_STORE = 'tradesKey';

export type Valued = Holding & { price: number | null; value: number | null; unrealised: number | null; limits?: Limits; check?: PositionCheck | null };
export interface TradesList { trades: Trade[]; holdings: Valued[]; warnings: string[]; badRows: number[]; settings?: LimitSettings }

export const readKey = (): string => readStored(KEY_STORE) ?? '';

// '1' while this browser has a Google session; then the session cookie, not the key, picks the user's own Sheet.
export const SIGNED_IN_STORE = 'googleSignedIn';
// Sheet mode: the key to send ('' when signed in with Google, the cookie does the work). null: browser mode.
export const sheetKey = (): string | null => (readStored(SIGNED_IN_STORE) === '1' ? '' : readKey() || null);

// One session check per page load; a session that ended turns the flag off.
let signInCheck: Promise<void> | undefined;
export function checkSignIn(): Promise<void> {
  signInCheck ??= fetch('/api/auth/session', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ user?: unknown } | null>) : null))
    .then((s) => writeStored(SIGNED_IN_STORE, s?.user ? '1' : ''))
    .catch((e: unknown) => console.warn('google sign-in state not checked; staying with the last known state', e));
  return signInCheck;
}
// Through the shared store so every page sees the switch between browser and Sheet at once.
export const storeKey = (k: string): void => writeStored(KEY_STORE, k);

// On the owner's own machine the dev server hands the key over (lib/dev-key.ts); one shared request per page load.
let autoKey: Promise<string> | undefined;
export function ensureKey(): Promise<string> {
  const k = readKey();
  if (k || process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(location.hostname)) return Promise.resolve(k);
  autoKey ??= fetch(`http://127.0.0.1:${process.env.NEXT_PUBLIC_DEV_KEY_PORT ?? 3011}/trades-key`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ key?: string }>) : Promise.reject(new Error(`dev key server answered ${r.status}`))))
    .then(({ key = '' }) => { storeKey(key); return key; })
    .catch((e: unknown) => { console.warn('trades key not filled in automatically; use the key box', e); return ''; });
  return autoKey;
}

export async function call<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), 'x-trades-key': key } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Server answered ${res.status}.`), { status: res.status });
  return body;
}

const TONE_CLASS: Record<string, string> = { bad: 's-avoid', warn: 's-caution', info: 's-info', good: 's-research', neutral: 's-neutral' };

export function CheckBadge({ check }: { check: PositionCheck }) {
  return <span className={`pill ${TONE_CLASS[check.tone] ?? 's-neutral'}`}>{check.label}</span>;
}
