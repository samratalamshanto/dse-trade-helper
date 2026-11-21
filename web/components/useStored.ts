'use client';

import { useCallback, useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'stored-value-change';
const memory = new Map<string, string>();

// Blocked storage (private mode, strict settings) falls back to memory, so settings still work for this visit.
export function readStored(key: string): string | null {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
}

function subscribe(onChange: () => void): () => void {
  addEventListener('storage', onChange);
  addEventListener(CHANGE_EVENT, onChange);
  return () => { removeEventListener('storage', onChange); removeEventListener(CHANGE_EVENT, onChange); };
}

// Outside React (the portfolio store): same storage and the same live update as the hook's setter.
export function writeStored(key: string, v: string): void {
  memory.set(key, v);
  try { localStorage.setItem(key, v); } catch (e) { console.warn(`could not save setting ${key}; it lasts this visit only`, e); }
  dispatchEvent(new Event(CHANGE_EVENT));
}

// A per-browser setting (theme, sidebar, ticks), shared live between components that read the same key.
export type StoredSetter = (v: string | ((current: string) => string)) => void;

export function useStoredValue(key: string, fallback: string): [string, StoredSetter] {
  const value = useSyncExternalStore(subscribe, () => readStored(key) ?? fallback, () => fallback);
  // An updater reads the value stored right now, so two quick changes never overwrite each other.
  const set = useCallback<StoredSetter>((next) => writeStored(key, typeof next === 'function' ? next(readStored(key) ?? fallback) : next), [key, fallback]);
  return [value, set];
}
