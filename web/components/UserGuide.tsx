'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/components/i18n';
import { useStoredValue } from '@/components/useStored';
import { GUIDE_KEY, GUIDE_STEPS, shouldShowGuide } from '@/lib/guide';

export { GUIDE_KEY, GUIDE_STEPS, shouldShowGuide };

function trapFocus(dialog: HTMLDivElement, e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const els = dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]');
  const first = els[0], last = els[els.length - 1];
  if (!first || !last) return;
  if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
  else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
}

// Not on the pages Google's reviewers open; /help keeps it for its "Show the welcome guide again" button.
const NO_GUIDE = new Set(['/privacy', '/terms']);

export function UserGuide({ hasPdf }: { hasPdf: boolean }) {
  const pathname = usePathname();
  const [shown, setShown] = useStoredValue(GUIDE_KEY, '0');
  const { t } = useLang();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const [mounted, setMounted] = useState(false);
  // The server cannot read the browser's "dismissed" mark, so the dialog renders only after mount.
  useEffect(() => { void Promise.resolve().then(() => setMounted(true)); }, []);
  const isOpen = mounted && !NO_GUIDE.has(pathname) && shouldShowGuide(shown);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      dialogRef.current?.focus();
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // While open, the page behind is inert (no Tab, no clicks) and does not scroll.
  useEffect(() => {
    if (!isOpen) return;
    const page = document.querySelector<HTMLElement>('.layout');
    page?.setAttribute('inert', '');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { page?.removeAttribute('inert'); document.body.style.overflow = overflow; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShown('1'); return; }
      if (dialogRef.current) trapFocus(dialogRef.current, e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, setShown]);

  if (!isOpen) return null;

  const dismiss = () => setShown('1');

  return (
    <div className="guide-overlay" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="guide-title"
        className="guide-dialog panel" tabIndex={-1}>
        <h2 id="guide-title" className="h3">{t('Welcome to Trade Helper')}</h2>
        <ol className="guide-steps small">
          {GUIDE_STEPS.map((s, i) => <li key={i}>{t(s)}</li>)}
        </ol>
        <p className="small muted">{t('Learning aid, not investment advice.')}</p>
        <div className="guide-footer">
          {hasPdf ? <a href="/user-guide.pdf" download className="small muted">{t('Download PDF guide')}</a> : null}
          <Link href="/help" className="btn" onClick={dismiss}>{t('Full guide')}</Link>
          <button type="button" className="btn primary" onClick={dismiss}>{t('Got it')}</button>
        </div>
      </div>
    </div>
  );
}
