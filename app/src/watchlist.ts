import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { parseWatchlist, toggleCode } from '../../web/lib/watchlist.ts';

const KEY = 'watchlist';

const read = () => AsyncStorage.getItem(KEY).then(parseWatchlist);

export function useWatchlist(): { codes: string[]; toggle: (code: string) => void; refresh: () => void } {
  const [codes, setCodes] = useState<string[]>([]);

  const refresh = useCallback(() => {
    read().then(setCodes).catch((e: unknown) => console.warn('watchlist read failed', e));
  }, []);

  useEffect(refresh, [refresh]);

  const toggle = useCallback((code: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((e: unknown) => console.warn('haptics failed', e));
    read()
      .then((stored) => {
        const next = toggleCode(stored, code);
        setCodes(next);
        return AsyncStorage.setItem(KEY, JSON.stringify(next));
      })
      .catch((e: unknown) => console.warn('watchlist save failed', e));
  }, []);

  return { codes, toggle, refresh };
}
