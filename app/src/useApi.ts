import { useCallback, useEffect, useState } from 'react';
import { getJson } from './api.ts';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export interface ApiResult<T> { path: string; data: T | null; error: string | null }

// A screen that stays mounted (a hidden tab) changes only its path; a result for another path must never be shown.
export function resultFor<T>(result: ApiResult<T> | null, path: string): ApiResult<T> | null {
  return result && result.path === path ? result : null;
}

const defaultLoad = (path: string) => getJson<unknown>(API_URL, path);

// `load` must keep the same identity between renders (a module-level function), or the effect reruns every render.
export function useApi<T>(path: string, load = defaultLoad as (path: string) => Promise<T>): ApiState<T> {
  const [result, setResult] = useState<ApiResult<T> | null>(null);
  const [reloading, setReloading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    load(path)
      .then((d) => { if (alive) setResult({ path, data: d, error: null }); })
      .catch((e: unknown) => {
        console.warn(`api ${path} failed`, e);
        const error = e instanceof Error ? e.message : 'Unexpected error';
        if (alive) setResult((prev) => ({ path, data: resultFor(prev, path)?.data ?? null, error }));
      })
      .finally(() => { if (alive) setReloading(false); });
    return () => { alive = false; };
  }, [path, tick, load]);

  const reload = useCallback(() => { setReloading(true); setTick((t) => t + 1); }, []);
  const current = resultFor(result, path);
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !current || reloading, reload };
}
