import { BN } from './i18n-bn.ts';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bnDigits = (s: string): string => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "12 Aug 2026", "Nov 23, 2026" and "February 2027" from the server, in the same Bangla form as fmtDateLang.
export function bnDate(v: string): string | null {
  const m = /^(?:(\d{1,2}) ([A-Z][a-z]{2,8})|([A-Z][a-z]{2,8})(?: (\d{1,2}),)?) (\d{4})$/.exec(v);
  const month = m ? MONTHS.indexOf((m[2] ?? m[3]).slice(0, 3).toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const day = m[1] ?? m[4];
  const d = new Date(Date.UTC(Number(m[5]), month, Number(day ?? 1)));
  return d.toLocaleDateString('bn-BD', day ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// A key with "{name}" parts also matches a line built with numbers, dates, codes or known words in those places.
const TEMPLATES = Object.keys(BN).filter((k) => /\{\w+\}/.test(k)).map((k) => {
  const names: string[] = [];
  const src = k.split(/(\{\w+\})/).map((p) => {
    const name = /^\{(\w+)\}$/.exec(p)?.[1];
    if (name) { names.push(name); return '(.+?)'; }
    return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { re: new RegExp('^' + src + '$'), names, bn: BN[k] };
});

// A value with English words fills a template only when it is a date, itself translates, or is one code-like token (GP, Q3, Dec-2025).
function filled(v: string): string | null {
  if (!/[A-Za-z]/.test(v)) return bnDigits(v);
  const date = bnDate(v);
  if (date) return date;
  const s = translate(v);
  if (s !== v) return s;
  return /^[\w&.\-/]{1,15}$/.test(v) ? v : null;
}

export function translate(s: string): string {
  if (Object.hasOwn(BN, s)) return BN[s];
  for (const { re, names, bn } of TEMPLATES) {
    const m = re.exec(s);
    if (!m) continue;
    const values = names.map((_, i) => filled(m[i + 1]));
    if (values.every((v) => v != null)) return names.reduce((out, name, i) => out.replace('{' + name + '}', values[i]!), bn);
  }
  return s;
}

export function translateLine(s: string): string {
  const whole = translate(s);
  // A line built from fixed sentences (or "Label:" heads) translates piece by piece.
  return whole !== s ? whole : s.replace(/([.:]) /g, '$1\u0000').split('\u0000').map(translate).join(' ');
}
