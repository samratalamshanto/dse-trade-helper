'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStoredValue } from '@/components/useStored';
import { useWatchlist } from '@/components/Watchlist';
import { useLang } from '@/components/i18n';
import { Icon, type IconName } from '@/components/ui';

const NAV: { group: string; items: { href: string; label: string; icon: IconName; also?: string[] }[] }[] = [
  { group: 'EXPLORE', items: [
    { href: '/', label: 'Dashboard', icon: 'home' },
    { href: '/all', label: 'Companies', icon: 'list', also: ['/sectors', '/dividends'] },
    { href: '/compare', label: 'Compare', icon: 'columns' },
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

const under = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
// One menu entry covers the tabbed pages (Companies = /all, /sectors, /dividends).
const isActive = (path: string, it: { href: string; also?: string[] }) => [it.href, ...(it.also ?? [])].some((h) => under(path, h));
// 'page' on the item's own page, 'true' when a sibling tab of the item is open.
function currentOf(path: string, it: { href: string; also?: string[] }): 'page' | 'true' | undefined {
  if (under(path, it.href)) return 'page';
  return isActive(path, it) ? 'true' : undefined;
}

export function Sidebar() {
  const path = usePathname();
  const [nav, setNav] = useStoredValue('nav', 'open');
  const collapsed = nav === 'collapsed';
  const watched = useWatchlist().codes.length;
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV.flatMap((g) => g.items).find((it) => isActive(path, it));
  useEffect(() => { document.body.classList.toggle('nav-collapsed', collapsed); }, [collapsed]);

  return (
    <aside id="nav" className={menuOpen ? 'menu-open' : ''}>
      <div className="brand">
        <span>৳</span><b className="nav-text">{t('Trade Helper')}</b>
        <button className="collapse" type="button" onClick={() => setNav(collapsed ? 'open' : 'collapsed')}
          aria-label={collapsed ? t('Show sidebar') : t('Hide sidebar')} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'panelOpen' : 'panelClose'} />
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
            <Link key={it.href} href={it.href} title={t(it.label)} className={isActive(path, it) ? 'active' : ''} onClick={() => setMenuOpen(false)}
              aria-current={currentOf(path, it)}>
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
