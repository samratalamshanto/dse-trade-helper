import type { Limits, LimitSettings, PositionCheck } from '@/lib/positions';
import type { Holding, Trade } from '@/lib/trades';
import { readStored, writeStored } from '@/components/useStored';

// Shared by /portfolio and the dashboard card: the stored trades key, the keyed API call and the check badge.
export const KEY_STORE = 'tradesKey';

export type Valued = Holding & { price: number | null; value: number | null; unrealised: number | null; limits?: Limits; check?: PositionCheck | null };
export interface TradesList { trades: Trade[]; holdings: Valued[]; warnings: string[]; badRows: number[]; settings?: LimitSettings }

export const readKey = (): string => readStored(KEY_STORE) ?? '';
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
