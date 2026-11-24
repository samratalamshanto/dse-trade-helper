'use client';

import { bnDigits, useLang } from '@/components/i18n';

// Translated text for places that are not React hooks-friendly (shared pills, server components).
// n fills a "{n}" in the text, after translation.
export function Tr({ text, n }: { text: string; n?: number }) {
  const { t, lang } = useLang();
  const s = t(text);
  return <>{n == null ? s : s.replace('{n}', lang === 'bn' ? bnDigits(String(n)) : String(n))}</>;
}

export function TrInfo({ text }: { text: string }) {
  const s = useLang().t(text);
  return <span className="info" tabIndex={0} role="note" aria-label={s} data-tip={s}>i</span>;
}
