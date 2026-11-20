'use client';

import { useLang } from '@/components/i18n';

// Translated text for places that are not React hooks-friendly (shared pills, server components).
export function Tr({ text }: { text: string }) {
  return <>{useLang().t(text)}</>;
}
