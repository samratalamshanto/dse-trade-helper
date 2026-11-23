'use client';

import { useLang } from '@/components/i18n';

// Translated text for places that are not React hooks-friendly (shared pills, server components).
// n fills a "{n}" in the text, after translation.
export function Tr({ text, n }: { text: string; n?: number }) {
  const s = useLang().t(text);
  return <>{n == null ? s : s.replace('{n}', String(n))}</>;
}
