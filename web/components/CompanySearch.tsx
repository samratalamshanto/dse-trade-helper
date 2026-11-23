'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, SignalPill, type Signal } from '@/components/ui';
import { useLang } from '@/components/i18n';
import { searchCompanies } from '@/lib/company-search';

export type { } from '@/lib/company-search';

export interface SearchCompany { code: string; name: string; signal?: string }

export interface CompanySearchProps {
  companies: SearchCompany[];
  value: string;
  onChange: (v: string) => void;
  onPick: (code: string) => void;
  label: string;
  placeholder?: string;
  watched?: ReadonlySet<string>;
}

export function CompanySearch({ companies, value, onChange, onPick, label, placeholder, watched }: CompanySearchProps) {
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

  return (
    <div className="search" ref={box}>
      <Icon name="search" />
      <input
        id={uid}
        placeholder={placeholder ?? t('Company code or name')}
        autoComplete="off"
        aria-label={label}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={open && hits.length > 0 ? `${uid}-s` : undefined}
        aria-activedescendant={open && hits.length > 0 ? `${uid}-o-${hi}` : undefined}
        value={value}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        onChange={(e) => { onChange(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[hi]) pick(hits[hi].code);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % (hits.length || 1));
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && value.trim() ? (
        <div className="suggest" id={`${uid}-s`} role="listbox">
          {hits.length ? hits.map((c, i) => (
            <a key={c.code} id={`${uid}-o-${i}`} role="option" aria-selected={i === hi}
              className={i === hi ? 'hl' : ''}
              href={`#${c.code}`}
              onClick={(e) => { e.preventDefault(); pick(c.code); }}>
              <span>
                <b className="mono">{c.code}</b>{' '}
                <span className="small muted">{c.name}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {watched?.has(c.code) && <span className="pill s-neutral" style={{ fontSize: 11 }}>{t('In watchlist')}</span>}
                {c.signal && <SignalPill signal={c.signal as Signal} />}
              </span>
            </a>
          )) : <div className="empty small">{t('No match')}</div>}
        </div>
      ) : null}
    </div>
  );
}
