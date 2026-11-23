'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useApp } from '@/components/AppProvider';
import { fmtDateLang, marketState } from '@/components/format';
import { useStoredValue } from '@/components/useStored';
import { LangToggle, useLang } from '@/components/i18n';
import { Icon, SignalPill, type Signal } from '@/components/ui';
import type { CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';

const SEARCH_LIMIT = 8;

interface CompaniesResponse { rows: CompanyRow[]; codes: { code: string; sector: string }[]; session: MarketSession | null }

function Search() {
  const router = useRouter();
  const { data } = useApi<CompaniesResponse>('/api/companies');
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const byCode = useMemo(() => Object.fromEntries((data?.rows || []).map((r) => [r.code, r])), [data]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !data) return [];
    return data.codes.filter((c) => c.code.toLowerCase().includes(t) || (byCode[c.code]?.name || '').toLowerCase().includes(t)).slice(0, SEARCH_LIMIT);
  }, [q, data, byCode]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const go = (code: string) => { setQ(''); setOpen(false); router.push('/c/' + encodeURIComponent(code)); };

  return (
    <div className="search" ref={box}>
      <Icon name="search" />
      <input id="q" placeholder={t('Company code or name')} autoComplete="off" aria-label={t('Search company')}
        role="combobox" aria-expanded={open && hits.length > 0}
        aria-controls={open && hits.length > 0 ? 'suggest' : undefined}
        aria-activedescendant={open && hits.length > 0 ? `suggest-opt-${hi}` : undefined}
        value={q}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[hi]) go(hits[hi].code);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % (hits.length || 1)); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && q.trim() ? (
        <div className="suggest" id="suggest" role="listbox">
          {hits.length ? hits.map((c, i) => (
            <a key={c.code} id={`suggest-opt-${i}`} role="option" aria-selected={i === hi} className={i === hi ? 'hl' : ''} href={'/c/' + encodeURIComponent(c.code)}
              onClick={(e) => { e.preventDefault(); go(c.code); }}>
              <span><b className="mono">{c.code}</b> <span className="small muted">{byCode[c.code]?.name || ''}</span></span>
              {byCode[c.code] ? <SignalPill signal={byCode[c.code].signal as Signal} /> : <span className="small muted">{c.sector}</span>}
            </a>
          )) : <div className="empty small">{t('No match')}</div>}
        </div>
      ) : null}
    </div>
  );
}

function useTheme(): () => void {
  const [theme, setTheme] = useStoredValue('theme', '');
  useEffect(() => { if (theme) document.documentElement.dataset.theme = theme; }, [theme]);
  return () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(dark ? 'light' : 'dark');
  };
}

export function Topbar() {
  const { session, refresh } = useApp();
  const toggleTheme = useTheme();
  const [spinning, setSpinning] = useState(false);
  const { t, lang } = useLang();
  const st = marketState(session);
  const stateText = st.key === 'open' ? t('Market open · updates every minute') : st.key === 'preopen' ? `${t('Pre-open')} · ${t('market opens')} ${session?.opening} ${t('today')}`
    : `${t('Market closed')}${session?.next ? ` · ${t('next session')} ${fmtDateLang(session.next, lang)}` : ''}`;
  const status = session ? `${t('DSE data')}: ${session.dataTime || fmtDateLang(session.sessionDate, lang)} · ${stateText}` : '';

  return (
    <header className="topbar">
      <Search />
      {/* Always mounted, so screen readers announce the status when it arrives; the visible pill repeats it. */}
      <span className="mkt-status" title={status || undefined}>
        {session ? <span aria-hidden="true" className="mkt-visual">
          <span className={`mkt-pill m-${st.key}`}><i />{t(st.short.replace('● ', ''))}</span>
          <span className="mkt-time">{session.dataTime || fmtDateLang(session.sessionDate, lang)}</span>
        </span> : null}
        <span className="sr-only" aria-live="polite">{status}</span>
      </span>
      <div className="top-actions">
        <button className={`btn icon-btn${spinning ? ' spin' : ''}`} type="button" aria-label={t('Refresh data now')} title={t('Refresh data now')} disabled={spinning}
          onClick={() => { setSpinning(true); refresh({ fresh: true }); setTimeout(() => setSpinning(false), 1500); }}>
          <Icon name="refresh" />
        </button>
        <LangToggle icon={<Icon name="globe" />} />
        <button className="btn icon-btn" type="button" aria-label={t('Toggle dark or light theme')} title={t('Toggle dark or light theme')} onClick={toggleTheme}><Icon name="moon" /></button>
      </div>
    </header>
  );
}
