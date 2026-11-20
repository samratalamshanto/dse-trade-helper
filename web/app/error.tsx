'use client';

import { useLang } from '@/components/i18n';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLang();
  return (
    <div className="panel empty-state" role="alert">
      <p><b>{t('Something went wrong on this page.')}</b></p>
      <p className="muted">{t('Try again. If it keeps failing, reload the page in a minute.')}</p>
      <button type="button" className="btn primary" onClick={reset}>{t('Try again')}</button>
    </div>
  );
}
