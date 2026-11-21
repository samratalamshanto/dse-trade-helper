'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang } from '@/components/i18n';
import { Icon, type IconName } from '@/components/ui';

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/all', label: 'Companies', icon: 'list' },
  { href: '/sectors', label: 'Sectors', icon: 'grid' },
  { href: '/dividends', label: 'Dividends', icon: 'calendar' },
];

// The three company views share one menu entry; these tabs switch between them.
export function CompanyTabs() {
  const path = usePathname();
  const { t } = useLang();
  return (
    <nav className="tabs page-tabs" aria-label={t('Companies')}>
      {TABS.map((tab) => (
        <Link key={tab.href} className="tab-link" href={tab.href} aria-current={path === tab.href ? 'page' : undefined}>
          <Icon name={tab.icon} />{t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
