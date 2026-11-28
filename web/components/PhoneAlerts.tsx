'use client';

import Link from 'next/link';
import { useLang } from '@/components/i18n';
import { useStoredValue } from '@/components/useStored';
import { KEY_STORE, SIGNED_IN_STORE } from '@/components/trades-client';
import { LOW52_ALERTS_STORE } from '@/lib/prefs';
import TelegramTestButton from '@/components/TelegramTestButton';
import { TelegramConnect } from '@/components/TelegramConnect';

// Telegram set-up, on the Alerts page next to the rules it delivers (moved from Portfolio settings).
export function PhoneAlerts() {
  const { t } = useLang();
  const [ownerKey] = useStoredValue(KEY_STORE, '');
  const [signedIn] = useStoredValue(SIGNED_IN_STORE, '');
  const [rawLow52, setLow52] = useStoredValue(LOW52_ALERTS_STORE, 'on');
  const ownerMode = !!ownerKey && signedIn !== '1';
  return (
    <div className="panel">
      <p className="small muted">{t('Get a Telegram message when a price rule or a 52-week range rule matches, a plan reaches its price, a holding hits your stop-loss or target, or a dividend\'s last buy day is near.')}</p>
      {ownerMode ? <TelegramTestButton />
        : signedIn === '1' ? (
          <TelegramConnect>
            <label className="check small">
              <input type="checkbox" checked={rawLow52 !== 'off'} onChange={(e) => setLow52(e.target.checked ? 'on' : 'off')} />
              <span>{t('Send a Telegram message when a share on your watchlist or in your portfolio comes within 20%, 15%, 10% or 5% of its 52-week low')}</span>
            </label>
          </TelegramConnect>
        )
        : <p className="small">{t('To get Telegram alerts, first sign in with Google on the')} <Link href="/portfolio">{t('Portfolio page')}</Link>{t('.')}</p>}
    </div>
  );
}
