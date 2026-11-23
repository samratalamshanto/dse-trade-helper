'use client';

import { type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, SignalPill, type Signal } from '@/components/ui';
import { useLang } from '@/components/i18n';
import { searchCompanies } from '@/lib/company-search';

export interface SearchCompany { code: string; name: string; signal?: string }

export interface CompanySearchProps {
  companies: SearchCompany[];
  value: string;
  onChange: (v: string) => void;
  onPick: (code: string) => void;
  label: string;
  placeholder?: string;
  watched?: ReadonlySet<string>;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function CompanySearch({ companies, value, onChange, onPick, label, placeholder, watched, inputRef }: CompanySearchProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();

  const hits = useMemo(() => searchCompanies(value, companies), [value, companies]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const pick = (code: string) => { setOpen(false); onPick(code); };
  const listOpen = open && value.trim().length > 0;

  return (
    <div className="search" ref={box}>
      <Icon name="search" />
      <input
        id={uid}
        ref={inputRef}
        placeholder={placeholder ?? t('Company code or name')}
        autoComplete="off"
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={listOpen}
        aria-controls={listOpen ? `${uid}-s` : undefined}
        aria-activedescendant={listOpen && hits.length > 0 ? `${uid}-o-${hi}` : undefined}
        value={value}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
        onChange={(e) => { onChange(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (open && hits[hi]) { e.preventDefault(); pick(hits[hi].code); }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open && value.trim()) { setOpen(true); return; }
            setHi((h) => (h + 1) % (hits.length || 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => (h + hits.length - 1) % (hits.length || 1));
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {listOpen ? (
        <div className="suggest" id={`${uid}-s`} role="listbox">
          {hits.length ? hits.map((c, i) => (
            <div key={c.code} id={`${uid}-o-${i}`} role="option" aria-selected={i === hi}
              className={i === hi ? 'hl' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(c.code); }}>
              <span>
                <b className="mono">{c.code}</b>{' '}
                <span className="small muted">{c.name}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {watched?.has(c.code) && <span className="pill s-neutral" style={{ fontSize: 11 }}>{t('In watchlist')}</span>}
                {c.signal && <SignalPill signal={c.signal as Signal} />}
              </span>
            </div>
          )) : <div role="option" aria-disabled="true" className="empty small">{t('No match')}</div>}
        </div>
      ) : null}
    </div>
  );
}
