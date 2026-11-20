'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStoredValue } from '@/components/useStored';
import { useWatchlist } from '@/components/Watchlist';
import { useLang } from '@/components/i18n';
import { Icon, type IconName } from '@/components/ui';

const NAV: { group: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  { group: 'EXPLORE', items: [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/all', label: 'All companies', icon: 'list' },
    { href: '/sectors', label: 'Sectors', icon: 'grid' },
    { href: '/compare', label: 'Compare', icon: 'columns' },
    { href: '/dividends', label: 'Dividend calendar', icon: 'calendar' },
    { href: '/fraud', label: 'Fraud alerts', icon: 'high' },
    { href: '/scorecard', label: 'Signal scorecard', icon: 'research' },
  ] },
  { group: 'MINE', items: [
    { href: '/watchlist', label: 'Watchlist', icon: 'star' },
    { href: '/portfolio', label: 'Portfolio', icon: 'wallet' },
    { href: '/trades', label: 'My trades', icon: 'trend' },
    { href: '/plans', label: 'Buy plans', icon: 'target' },
    { href: '/alerts', label: 'Alerts', icon: 'bell' },
  ] },
  { group: 'HELP', items: [
    { href: '/learn', label: 'How it works', icon: 'help' },
    { href: '/plan', label: 'Start investing', icon: 'file' },
  ] },
];

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function Sidebar() {
  const path = usePathname();
  const [nav, setNav] = useStoredValue('nav', 'open');
  const collapsed = nav === 'collapsed';
  const watched = useWatchlist().codes.length;
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV.flatMap((g) => g.items).find((it) => isActive(path, it.href));
  useEffect(() => { document.body.classList.toggle('nav-collapsed', collapsed); }, [collapsed]);

  return (
    <aside id="nav" className={menuOpen ? 'menu-open' : ''}>
      <div className="brand">
        <span>৳</span><b className="nav-text">{t('DSE Trade Helper')}</b>
        <button className="collapse" type="button" onClick={() => setNav(collapsed ? 'open' : 'collapsed')}
          aria-label={collapsed ? t('Show sidebar') : t('Hide sidebar')} aria-expanded={!collapsed}>
          <Icon name="panel" />
        </button>
        <button className="btn menu-btn" type="button" aria-expanded={menuOpen} aria-controls="nav-links" onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name={menuOpen ? 'cross' : 'list'} /> {menuOpen ? t('Close') : `${t('Menu')}${current ? ' · ' + t(current.label) : ''}`}
        </button>
      </div>
      <nav id="nav-links" aria-label={t('Main')}>
      {NAV.map((g) => (
        <div key={g.group} style={{ display: 'contents' }}>
          <div className="navlabel">{t(g.group)}</div>
          {g.items.map((it) => (
            <Link key={it.href} href={it.href} title={t(it.label)} className={isActive(path, it.href) ? 'active' : ''} onClick={() => setMenuOpen(false)}
              aria-current={isActive(path, it.href) ? 'page' : undefined}>
              <Icon name={it.icon} /><span className="nav-text">{t(it.label)}</span>
              {it.href === '/watchlist' && watched ? <span className="nav-count mono" aria-label={`${watched} saved`}>{watched}</span> : null}
            </Link>
          ))}
        </div>
      ))}
      </nav>
    </aside>
  );
}
