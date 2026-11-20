'use client';

import { useMemo } from 'react';
import { Tr } from '@/components/Tr';
import { useStoredValue } from '@/components/useStored';
import { Icon } from '@/components/ui';
import { parseWatchlist, toggleCode } from '@/lib/watchlist';

// Per-browser watchlist (no login yet); every component reading it updates together.
export function useWatchlist() {
  const [raw, setRaw] = useStoredValue('watchlist', '[]');
  const codes = useMemo(() => parseWatchlist(raw), [raw]);
  return {
    codes,
    has: (code: string) => codes.includes(code.toUpperCase()),
    toggle: (code: string) => setRaw((current) => JSON.stringify(toggleCode(parseWatchlist(current), code))),
  };
}

export function WatchButton({ code, withText = false }: { code: string; withText?: boolean }) {
  const { has, toggle } = useWatchlist();
  const on = has(code);
  return (
    <button type="button" className={`watch-btn${on ? ' on' : ''}${withText ? ' with-text' : ''}`} aria-pressed={on}
      // The icon-only star needs a label; the text button's visible words are its name, so voice users can say them.
      aria-label={withText ? undefined : on ? `Remove ${code} from watchlist` : `Add ${code} to watchlist`}
      title={on ? 'Saved in your watchlist' : 'Save to your watchlist'}
      onClick={(e) => { e.stopPropagation(); toggle(code); }}>
      <Icon name="star" />{withText ? <span><Tr text={on ? 'Saved to watchlist' : 'Save to watchlist'} /></span> : null}
    </button>
  );
}
