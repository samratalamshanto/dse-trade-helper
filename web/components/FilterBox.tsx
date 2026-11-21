'use client';

import { useLang } from '@/components/i18n';
import { Icon } from '@/components/ui';

// True when the typed text is part of the code or the name; an empty box matches everything.
export function matchesText(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle));
}

// A search box that filters the list on the page it sits on (the top bar search opens one company instead).
export function FilterBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useLang();
  return (
    <div className="search">
      <Icon name="search" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t(label)} aria-label={t(label)} />
    </div>
  );
}
