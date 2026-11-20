// Watchlist rules, kept free of React so they can be unit tested.
import { CODE_RE } from './dhaka.ts';
export const WATCHLIST_MAX = 200;

// Reads the saved list; damaged JSON, wrong types, bad codes and duplicates are dropped instead of breaking the page.
export function parseWatchlist(raw: string | null | undefined): string[] {
  let value: unknown;
  try { value = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const codes = value.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toUpperCase()).filter((v) => CODE_RE.test(v));
  return [...new Set(codes)].slice(0, WATCHLIST_MAX);
}

export function toggleCode(list: readonly string[], code: string): string[] {
  const c = code.toUpperCase();
  if (list.includes(c)) return list.filter((x) => x !== c);
  return CODE_RE.test(c) ? [...list, c].slice(-WATCHLIST_MAX) : [...list];
}
