import type { Limits, LimitSettings, PositionCheck } from '@/lib/positions';
import type { Holding, Trade } from '@/lib/trades';

// Shared by /trades and the dashboard card: the stored trades key, the keyed API call and the check badge.
const KEY_STORE = 'tradesKey';

export type Valued = Holding & { price: number | null; value: number | null; unrealised: number | null; limits?: Limits; check?: PositionCheck | null };
export interface TradesList { trades: Trade[]; holdings: Valued[]; warnings: string[]; badRows: number[]; settings?: LimitSettings }

export const readKey = () => { try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; } };
export const storeKey = (k: string) => { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) { console.warn('trades key not saved in this browser', e); } };

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
