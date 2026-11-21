'use client';

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useStoredValue } from '@/components/useStored';
import { BN } from '@/components/i18n-bn';

export type Lang = 'en' | 'bn';

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string };
const LangContext = createContext<LangCtx>({ lang: 'en', setLang: () => {}, t: (s) => s });

export function LangProvider({ children }: { children: ReactNode }) {
  const [raw, set] = useStoredValue('lang', 'en');
  const lang: Lang = raw === 'bn' ? 'bn' : 'en';
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = useCallback((s: string) => (lang === 'bn' && Object.hasOwn(BN, s) ? BN[s] : s), [lang]);
  return <LangContext.Provider value={{ lang, setLang: (l) => set(l), t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangCtx {
  return useContext(LangContext);
}

export function LangToggle({ icon }: { icon?: ReactNode }) {
  const { lang, setLang } = useLang();
  return (
    <button type="button" className="btn" lang={lang === 'en' ? 'bn' : 'en'} onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
      aria-label={lang === 'en' ? 'বাংলায় দেখুন (Switch to Bangla)' : 'Switch to English (ইংরেজিতে দেখুন)'}>
      {icon}<span className="lang-text">{lang === 'en' ? 'বাংলা' : 'English'}</span>
    </button>
  );
}
