'use client';

import { useCallback, useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'stored-value-change';
const memory = new Map<string, string>();

// Blocked storage (private mode, strict settings) falls back to memory, so settings still work for this visit.
function read(key: string): string | null {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
}

function subscribe(onChange: () => void): () => void {
  addEventListener('storage', onChange);
  addEventListener(CHANGE_EVENT, onChange);
  return () => { removeEventListener('storage', onChange); removeEventListener(CHANGE_EVENT, onChange); };
}

// A per-browser setting (theme, sidebar, ticks), shared live between components that read the same key.
export type StoredSetter = (v: string | ((current: string) => string)) => void;

export function useStoredValue(key: string, fallback: string): [string, StoredSetter] {
  const value = useSyncExternalStore(subscribe, () => read(key) ?? fallback, () => fallback);
  // An updater reads the value stored right now, so two quick changes never overwrite each other.
  const set = useCallback<StoredSetter>((next) => {
    const v = typeof next === 'function' ? next(read(key) ?? fallback) : next;
    memory.set(key, v);
    try { localStorage.setItem(key, v); } catch (e) { console.warn(`could not save setting ${key}; it lasts this visit only`, e); }
    dispatchEvent(new Event(CHANGE_EVENT));
  }, [key, fallback]);
  return [value, set];
}
