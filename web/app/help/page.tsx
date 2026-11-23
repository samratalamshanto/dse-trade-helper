'use client';

import { GUIDE_KEY, GUIDE_STEPS } from '@/components/UserGuide';
import { useLang } from '@/components/i18n';
import { useStoredValue } from '@/components/useStored';

export default function HelpPage() {
  const { t } = useLang();
  const [, setShown] = useStoredValue(GUIDE_KEY, '0');

  return (
    <>
      <h1>{t('Help & guides')}</h1>

      <section className="panel" aria-labelledby="guide-section-title">
        <h2 id="guide-section-title" className="h3">{t('Welcome guide')}</h2>
        <ol className="guide-steps small" style={{ marginBottom: 14 }}>
          {GUIDE_STEPS.map((s, i) => <li key={i}>{t(s)}</li>)}
        </ol>
        <p className="small muted">{t('Learning aid, not investment advice.')}</p>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setShown('0')}>
            {t('Show the welcome guide again')}
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="video-section-title" style={{ marginTop: 14 }}>
        <h2 id="video-section-title" className="h3">{t('Demo video')}</h2>
        <video controls preload="metadata" src="/demo.mp4" className="help-video">
          <track kind="subtitles" src="/demo.vtt" srcLang="en" label="English" default />
          {t('Your browser does not support the video element.')}
        </video>
        <div style={{ marginTop: 8 }}>
          <a href="/demo.mp4" download className="btn">{t('Download video')}</a>
        </div>
      </section>

      <section className="panel" aria-labelledby="pdf-section-title" style={{ marginTop: 14 }}>
        <h2 id="pdf-section-title" className="h3">{t('PDF guide')}</h2>
        <p className="small muted" style={{ marginBottom: 10 }}>{t('The full guide as a printable PDF.')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/user-guide.pdf" target="_blank" rel="noreferrer"
            aria-label={t('View the guide (opens in a new tab)')} className="btn">
            {t('View the guide')}
          </a>
          <a href="/user-guide.pdf" download className="btn">{t('Download PDF')}</a>
        </div>
      </section>
    </>
  );
}
